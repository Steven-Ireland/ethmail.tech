var Web3 = require("web3");
var SolidityEvent = require("web3/lib/web3/event.js");

(function() {
  // Planned for future features, logging, etc.
  function Provider(provider) {
    this.provider = provider;
  }

  Provider.prototype.send = function() {
    this.provider.send.apply(this.provider, arguments);
  };

  Provider.prototype.sendAsync = function() {
    this.provider.sendAsync.apply(this.provider, arguments);
  };

  var BigNumber = (new Web3()).toBigNumber(0).constructor;

  var Utils = {
    is_object: function(val) {
      return typeof val == "object" && !Array.isArray(val);
    },
    is_big_number: function(val) {
      if (typeof val != "object") return false;

      // Instanceof won't work because we have multiple versions of Web3.
      try {
        new BigNumber(val);
        return true;
      } catch (e) {
        return false;
      }
    },
    merge: function() {
      var merged = {};
      var args = Array.prototype.slice.call(arguments);

      for (var i = 0; i < args.length; i++) {
        var object = args[i];
        var keys = Object.keys(object);
        for (var j = 0; j < keys.length; j++) {
          var key = keys[j];
          var value = object[key];
          merged[key] = value;
        }
      }

      return merged;
    },
    promisifyFunction: function(fn, C) {
      var self = this;
      return function() {
        var instance = this;

        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {
          var callback = function(error, result) {
            if (error != null) {
              reject(error);
            } else {
              accept(result);
            }
          };
          args.push(tx_params, callback);
          fn.apply(instance.contract, args);
        });
      };
    },
    synchronizeFunction: function(fn, instance, C) {
      var self = this;
      return function() {
        var args = Array.prototype.slice.call(arguments);
        var tx_params = {};
        var last_arg = args[args.length - 1];

        // It's only tx_params if it's an object and not a BigNumber.
        if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
          tx_params = args.pop();
        }

        tx_params = Utils.merge(C.class_defaults, tx_params);

        return new Promise(function(accept, reject) {

          var decodeLogs = function(logs) {
            return logs.map(function(log) {
              var logABI = C.events[log.topics[0]];

              if (logABI == null) {
                return null;
              }

              var decoder = new SolidityEvent(null, logABI, instance.address);
              return decoder.decode(log);
            }).filter(function(log) {
              return log != null;
            });
          };

          var callback = function(error, tx) {
            if (error != null) {
              reject(error);
              return;
            }

            var timeout = C.synchronization_timeout || 240000;
            var start = new Date().getTime();

            var make_attempt = function() {
              C.web3.eth.getTransactionReceipt(tx, function(err, receipt) {
                if (err) return reject(err);

                if (receipt != null) {
                  // If they've opted into next gen, return more information.
                  if (C.next_gen == true) {
                    return accept({
                      tx: tx,
                      receipt: receipt,
                      logs: decodeLogs(receipt.logs)
                    });
                  } else {
                    return accept(tx);
                  }
                }

                if (timeout > 0 && new Date().getTime() - start > timeout) {
                  return reject(new Error("Transaction " + tx + " wasn't processed in " + (timeout / 1000) + " seconds!"));
                }

                setTimeout(make_attempt, 1000);
              });
            };

            make_attempt();
          };

          args.push(tx_params, callback);
          fn.apply(self, args);
        });
      };
    }
  };

  function instantiate(instance, contract) {
    instance.contract = contract;
    var constructor = instance.constructor;

    // Provision our functions.
    for (var i = 0; i < instance.abi.length; i++) {
      var item = instance.abi[i];
      if (item.type == "function") {
        if (item.constant == true) {
          instance[item.name] = Utils.promisifyFunction(contract[item.name], constructor);
        } else {
          instance[item.name] = Utils.synchronizeFunction(contract[item.name], instance, constructor);
        }

        instance[item.name].call = Utils.promisifyFunction(contract[item.name].call, constructor);
        instance[item.name].sendTransaction = Utils.promisifyFunction(contract[item.name].sendTransaction, constructor);
        instance[item.name].request = contract[item.name].request;
        instance[item.name].estimateGas = Utils.promisifyFunction(contract[item.name].estimateGas, constructor);
      }

      if (item.type == "event") {
        instance[item.name] = contract[item.name];
      }
    }

    instance.allEvents = contract.allEvents;
    instance.address = contract.address;
    instance.transactionHash = contract.transactionHash;
  };

  // Use inheritance to create a clone of this contract,
  // and copy over contract's static functions.
  function mutate(fn) {
    var temp = function Clone() { return fn.apply(this, arguments); };

    Object.keys(fn).forEach(function(key) {
      temp[key] = fn[key];
    });

    temp.prototype = Object.create(fn.prototype);
    bootstrap(temp);
    return temp;
  };

  function bootstrap(fn) {
    fn.web3 = new Web3();
    fn.class_defaults  = fn.prototype.defaults || {};

    // Set the network iniitally to make default data available and re-use code.
    // Then remove the saved network id so the network will be auto-detected on first use.
    fn.setNetwork("default");
    fn.network_id = null;
    return fn;
  };

  // Accepts a contract object created with web3.eth.contract.
  // Optionally, if called without `new`, accepts a network_id and will
  // create a new version of the contract abstraction with that network_id set.
  function Contract() {
    if (this instanceof Contract) {
      instantiate(this, arguments[0]);
    } else {
      var C = mutate(Contract);
      var network_id = arguments.length > 0 ? arguments[0] : "default";
      C.setNetwork(network_id);
      return C;
    }
  };

  Contract.currentProvider = null;

  Contract.setProvider = function(provider) {
    var wrapped = new Provider(provider);
    this.web3.setProvider(wrapped);
    this.currentProvider = provider;
  };

  Contract.new = function() {
    if (this.currentProvider == null) {
      throw new Error("EthMail error: Please call setProvider() first before calling new().");
    }

    var args = Array.prototype.slice.call(arguments);

    if (!this.unlinked_binary) {
      throw new Error("EthMail error: contract binary not set. Can't deploy new instance.");
    }

    var regex = /__[^_]+_+/g;
    var unlinked_libraries = this.binary.match(regex);

    if (unlinked_libraries != null) {
      unlinked_libraries = unlinked_libraries.map(function(name) {
        // Remove underscores
        return name.replace(/_/g, "");
      }).sort().filter(function(name, index, arr) {
        // Remove duplicates
        if (index + 1 >= arr.length) {
          return true;
        }

        return name != arr[index + 1];
      }).join(", ");

      throw new Error("EthMail contains unresolved libraries. You must deploy and link the following libraries before you can deploy a new version of EthMail: " + unlinked_libraries);
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var contract_class = self.web3.eth.contract(self.abi);
      var tx_params = {};
      var last_arg = args[args.length - 1];

      // It's only tx_params if it's an object and not a BigNumber.
      if (Utils.is_object(last_arg) && !Utils.is_big_number(last_arg)) {
        tx_params = args.pop();
      }

      tx_params = Utils.merge(self.class_defaults, tx_params);

      if (tx_params.data == null) {
        tx_params.data = self.binary;
      }

      // web3 0.9.0 and above calls new twice this callback twice.
      // Why, I have no idea...
      var intermediary = function(err, web3_instance) {
        if (err != null) {
          reject(err);
          return;
        }

        if (err == null && web3_instance != null && web3_instance.address != null) {
          accept(new self(web3_instance));
        }
      };

      args.push(tx_params, intermediary);
      contract_class.new.apply(contract_class, args);
    });
  };

  Contract.at = function(address) {
    if (address == null || typeof address != "string" || address.length != 42) {
      throw new Error("Invalid address passed to EthMail.at(): " + address);
    }

    var contract_class = this.web3.eth.contract(this.abi);
    var contract = contract_class.at(address);

    return new this(contract);
  };

  Contract.deployed = function() {
    if (!this.address) {
      throw new Error("Cannot find deployed address: EthMail not deployed or address not set.");
    }

    return this.at(this.address);
  };

  Contract.defaults = function(class_defaults) {
    if (this.class_defaults == null) {
      this.class_defaults = {};
    }

    if (class_defaults == null) {
      class_defaults = {};
    }

    var self = this;
    Object.keys(class_defaults).forEach(function(key) {
      var value = class_defaults[key];
      self.class_defaults[key] = value;
    });

    return this.class_defaults;
  };

  Contract.extend = function() {
    var args = Array.prototype.slice.call(arguments);

    for (var i = 0; i < arguments.length; i++) {
      var object = arguments[i];
      var keys = Object.keys(object);
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = object[key];
        this.prototype[key] = value;
      }
    }
  };

  Contract.all_networks = {
  "default": {
    "abi": [
      {
        "constant": false,
        "inputs": [],
        "name": "Mail",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "userExists",
        "outputs": [
          {
            "name": "",
            "type": "bool"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [],
        "name": "retrieveDonations",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newCost",
            "type": "uint256"
          }
        ],
        "name": "changeCost",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "lastDonation",
        "outputs": [
          {
            "name": "from",
            "type": "address"
          },
          {
            "name": "amount",
            "type": "uint256"
          },
          {
            "name": "blockNumber",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "loadPreferences",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "preferences",
            "type": "string"
          }
        ],
        "name": "savePreferences",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          }
        ],
        "name": "getPublicKey",
        "outputs": [
          {
            "name": "",
            "type": "string"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "owner",
        "outputs": [
          {
            "name": "",
            "type": "address"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "newOwner",
            "type": "address"
          }
        ],
        "name": "changeOwner",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "addr",
            "type": "address"
          },
          {
            "name": "hash",
            "type": "string"
          }
        ],
        "name": "sendMail",
        "outputs": [],
        "payable": true,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [
          {
            "name": "recent",
            "type": "uint256"
          }
        ],
        "name": "loadUnread",
        "outputs": [
          {
            "name": "",
            "type": "address"
          },
          {
            "name": "",
            "type": "string"
          },
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "getUnreadSize",
        "outputs": [
          {
            "name": "",
            "type": "uint256"
          }
        ],
        "payable": false,
        "type": "function"
      },
      {
        "constant": false,
        "inputs": [
          {
            "name": "public_key",
            "type": "string"
          }
        ],
        "name": "register",
        "outputs": [],
        "payable": false,
        "type": "function"
      },
      {
        "payable": true,
        "type": "fallback"
      }
    ],
    "unlinked_binary": "0x6060604052600060015534610000575b610dd78061001e6000396000f300606060405236156100b45763ffffffff60e060020a60003504166304fc5f9a81146101195780630e666e491461012857806346a4fe9f146101555780635cb85cd214610164578063661a5611146101765780637471a62e146101ab578063847bd8af14610238578063857cdbb81461028d5780638da5cb5b14610326578063a6f9dae11461034f578063bd875fee1461036a578063d884318d146103c4578063e53adc9c1461046d578063f2c298be1461048c575b6101175b600454349010806100cb57506005544390105b156101145760408051606081018252600160a060020a0333168082523460208301819052439290930182905260038054600160a060020a03191690911790556004919091556005555b5b565b005b34610000576101176104e1565b005b3461000057610141600160a060020a03600435166104ff565b604080519115158252519081900360200190f35b3461000057610117610532565b005b346100005761011760043561058a565b005b34610000576101836105af565b60408051600160a060020a039094168452602084019290925282820152519081900360600190f35b34610000576101b86105c7565b6040805160208082528351818301528351919283929083019185019080838382156101fe575b8051825260208311156101fe57601f1990920191602091820191016101de565b505050905090810190601f16801561022a5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b3461000057610117600480803590602001908201803590602001908080601f016020809104026020016040519081016040528093929190818152602001838380828437509496506106c695505050505050565b005b34610000576101b8600160a060020a036004351661079b565b6040805160208082528351818301528351919283929083019185019080838382156101fe575b8051825260208311156101fe57601f1990920191602091820191016101de565b505050905090810190601f16801561022a5780820380516001836020036101000a031916815260200191505b509250505060405180910390f35b346100005761033361084e565b60408051600160a060020a039092168252519081900360200190f35b3461000057610117600160a060020a036004351661085d565b005b60408051602060046024803582810135601f8101859004850286018501909652858552610117958335600160a060020a0316959394604494939290920191819084018382808284375094965061089895505050505050565b005b34610000576103d4600435610ae6565b60408051600160a060020a038516815290810182905260606020808301828152855192840192909252845160808401918601908083838215610431575b80518252602083111561043157601f199092019160209182019101610411565b505050905090810190601f16801561045d5780820380516001836020036101000a031916815260200191505b5094505050505060405180910390f35b346100005761047a610cb8565b60408051918252519081900360200190f35b3461000057610117600480803590602001908201803590602001908080601f01602080910402602001604051908101604052809392919081815260200183838082843750949650610cf795505050505050565b005b60008054600160a060020a03191633600160a060020a03161790555b565b600160a060020a03811660009081526002602081905260409091205460001961010060018316150201160415155b919050565b60005433600160a060020a0390811691161461054d57610000565b60008054604051600160a060020a0391821692309092163180156108fc0292909190818181858888f19350505050151561011457610000565b5b5b565b60005433600160a060020a039081169116146105a557610000565b60018190555b5b50565b600354600454600554600160a060020a039092169183565b6040805160208101909152600081526105df336104ff565b1561068c5733600160a060020a03166000908152600260208181526040928390206001908101805485519281161561010002600019011693909304601f810183900483028201830190945283815292908301828280156106805780601f1061065557610100808354040283529160200191610680565b820191906000526020600020905b81548152906001019060200180831161066357829003601f168201915b505050505090506106c2565b5060408051808201909152601481527f416e204572726f7220686173204f63637572656400000000000000000000000060208201525b5b90565b6106cf336104ff565b156105ab57806002600033600160a060020a0316600160a060020a031681526020019081526020016000206001019080519060200190828054600181600116156101000203166002900490600052602060002090601f016020900481019282601f1061074657805160ff1916838001178555610773565b82800160010185558215610773579182015b82811115610773578251825591602001919060010190610758565b5b506107949291505b80821115610790576000815560010161077c565b5090565b50505b5b50565b60408051602080820183526000808352600160a060020a0385168152600280835290849020805485516001821615610100026000190190911692909204601f810184900484028301840190955284825292939092918301828280156108415780601f1061081657610100808354040283529160200191610841565b820191906000526020600020905b81548152906001019060200180831161082457829003601f168201915b505050505090505b919050565b600054600160a060020a031681565b60005433600160a060020a0390811691161461087857610000565b60008054600160a060020a031916600160a060020a0383161790555b5b50565b6001546000903410610a90576108ad836104ff565b15610a9057600160a060020a038316600090815260026020819052604090912001805460018101808355828183801582901161098d5760030281600302836000526020600020918201910161098d91905b80821115610790578054600160a060020a031916815560018082018054600080835592600260001991831615610100029190910190911604601f8190106109455750610977565b601f01602090049060005260206000209081019061097791905b80821115610790576000815560010161077c565b5090565b5b5050600060028201556003016108fe565b5090565b5b505050916000526020600020906003020160005b5060408051606081018252600160a060020a033316808252602080830188905242938301939093528354600160a060020a03191617835585516001808501805460008281528690209496959194601f600260001995841615610100029590950190921693909304810182900483019392918a0190839010610a2e57805160ff1916838001178555610a5b565b82800160010185558215610a5b579182015b82811115610a5b578251825591602001919060010190610a40565b5b50610a7c9291505b80821115610790576000815560010161077c565b5090565b505060408201518160020155505050610a95565b610000565b5b5060015434036000811115610ad557604051600160a060020a0333169082156108fc029083906000818181858888f193505050501515610ad557610000565b5b610794565b610000565b5b505050565b600060206040519081016040528060008152506000610b04336104ff565b15610c6757600160a060020a0333166000908152600260208190526040909120018054859081101561000057906000526020600020906003020160005b5054600160a060020a033381166000908152600260208190526040909120018054919092169190869081101561000057906000526020600020906003020160005b506001016002600033600160a060020a0316600160a060020a0316815260200190815260200160002060020186815481101561000057906000526020600020906003020160005b5060029081015482546040805160206001841615610100026000190190931694909404601f81018390048302850183019091528084529192918491830182828015610c555780601f10610c2a57610100808354040283529160200191610c55565b820191906000526020600020905b815481529060010190602001808311610c3857829003601f168201915b50505050509150925092509250610cb0565b50506000805460408051808201909152601481527f416e204572726f7220686173204f6363757265640000000000000000000000006020820152600160a060020a039091169250905b5b9193909250565b6000610cc3336104ff565b15610ceb5750600160a060020a033316600090815260026020819052604090912001546106c2565b5060006106c2565b5b90565b33600160a060020a03166000908152600260208181526040832084518154828652948390209194600181161561010002600019011693909304601f9081018390048201939286019083901061074657805160ff1916838001178555610773565b82800160010185558215610773579182015b82811115610773578251825591602001919060010190610758565b5b506107949291505b80821115610790576000815560010161077c565b5090565b50505b505600a165627a7a72305820e3c8455b5ed8d48eb55119631565f0d0f2728196c8e9dcd5bbb8f36922b3db790029",
    "events": {},
    "updated_at": 1485617146101,
    "links": {},
    "address": "0x4f459b9290f0f3de670de2f38e30245ff94d8164"
  }
};

  Contract.checkNetwork = function(callback) {
    var self = this;

    if (this.network_id != null) {
      return callback();
    }

    this.web3.version.network(function(err, result) {
      if (err) return callback(err);

      var network_id = result.toString();

      // If we have the main network,
      if (network_id == "1") {
        var possible_ids = ["1", "live", "default"];

        for (var i = 0; i < possible_ids.length; i++) {
          var id = possible_ids[i];
          if (Contract.all_networks[id] != null) {
            network_id = id;
            break;
          }
        }
      }

      if (self.all_networks[network_id] == null) {
        return callback(new Error(self.name + " error: Can't find artifacts for network id '" + network_id + "'"));
      }

      self.setNetwork(network_id);
      callback();
    })
  };

  Contract.setNetwork = function(network_id) {
    var network = this.all_networks[network_id] || {};

    this.abi             = this.prototype.abi             = network.abi;
    this.unlinked_binary = this.prototype.unlinked_binary = network.unlinked_binary;
    this.address         = this.prototype.address         = network.address;
    this.updated_at      = this.prototype.updated_at      = network.updated_at;
    this.links           = this.prototype.links           = network.links || {};
    this.events          = this.prototype.events          = network.events || {};

    this.network_id = network_id;
  };

  Contract.networks = function() {
    return Object.keys(this.all_networks);
  };

  Contract.link = function(name, address) {
    if (typeof name == "function") {
      var contract = name;

      if (contract.address == null) {
        throw new Error("Cannot link contract without an address.");
      }

      Contract.link(contract.contract_name, contract.address);

      // Merge events so this contract knows about library's events
      Object.keys(contract.events).forEach(function(topic) {
        Contract.events[topic] = contract.events[topic];
      });

      return;
    }

    if (typeof name == "object") {
      var obj = name;
      Object.keys(obj).forEach(function(name) {
        var a = obj[name];
        Contract.link(name, a);
      });
      return;
    }

    Contract.links[name] = address;
  };

  Contract.contract_name   = Contract.prototype.contract_name   = "EthMail";
  Contract.generated_with  = Contract.prototype.generated_with  = "3.2.0";

  // Allow people to opt-in to breaking changes now.
  Contract.next_gen = false;

  var properties = {
    binary: function() {
      var binary = Contract.unlinked_binary;

      Object.keys(Contract.links).forEach(function(library_name) {
        var library_address = Contract.links[library_name];
        var regex = new RegExp("__" + library_name + "_*", "g");

        binary = binary.replace(regex, library_address.replace("0x", ""));
      });

      return binary;
    }
  };

  Object.keys(properties).forEach(function(key) {
    var getter = properties[key];

    var definition = {};
    definition.enumerable = true;
    definition.configurable = false;
    definition.get = getter;

    Object.defineProperty(Contract, key, definition);
    Object.defineProperty(Contract.prototype, key, definition);
  });

  bootstrap(Contract);

  if (typeof module != "undefined" && typeof module.exports != "undefined") {
    module.exports = Contract;
  } else {
    // There will only be one version of this contract in the browser,
    // and we can use that.
    window.EthMail = Contract;
  }
})();
