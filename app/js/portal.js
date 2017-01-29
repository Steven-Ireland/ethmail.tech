/* jshint -W083 */
/* jshint -W004 */
/* jshint -W041 */

var app = {};
var Mail;

$(document).ready(function() {
  Mail = EthMail.deployed();

  openpgp.initWorker({ path:'js/openpgp.worker.min.js' });
  openpgp.config.use_native = false;

  initializeVue();
  initializeWeb3(5, loadApp);

});

function initializeWeb3(retries, cb) {
  if (retries < 1 || typeof(web3) === 'undefined') {
    cb(false);
  } else {
    app.account.address = web3.eth.defaultAccount;
    Mail.userExists.call(app.account.address, {from: app.account.address}).then(function(doesExist) {
        app.account.exists = doesExist;
        cb(true);
    }).catch(function(err) {
      setTimeout(function() {
        initializeWeb3(retries--, cb);
      }, 500);
    });
  }
}

function loadApp(web3Loaded) {
  app.meta.web3 = web3Loaded;

  if (web3Loaded) {
    checkForMoreDonations();
    web3.eth.filter("latest").watch(function() {
      checkForMoreDonations();
    });
  }
}

function loadMail() {
  var numUnread = 0;
  Mail.getUnreadSize.call({from: app.account.address}).then(function(size) {
    numUnread = size;

    if (app.account.privateKey) {
      for (var i=0; i<numUnread; i++) {
        Mail.loadUnread.call(i, {from: app.account.address}).then(function(mail) {
          processMail(mail);
        });
      }

      web3.eth.filter("latest").watch(_.debounce(function() {
        checkForMoreMail(numUnread).then(function(num) {
          numUnread = num;
        });
      }, 1000));
    }

    if (size == 0) {
      // make a starter email
      Mail.owner.call({from: app.account.address}).then(function(owner) {
        app.inbox.emails.push(new Email(
          owner,
          'Welcome to Ethmail.tech!',
          'If you have any questions or concerns feel free to reply to this email or press the \'feedback\' button in the top right.\n\nWelcome to the web3!',
          new Date().getTime()/1000
        ));
      });
    }
  });
}

function checkForMoreMail(lastCount) {
  return Mail.getUnreadSize.call({from: app.account.address}).then(function(size) {
    if (size > lastCount) {
      for (var i=lastCount; i < size; i++) {
        Mail.loadUnread.call(i, {from: app.account.address}).then(function(mail) {
          processMail(mail);
        });
      }
    }
    return size;
  });
}

function checkForMoreDonations() {
  return Mail.lastDonation.call({from: app.account.address}).then(function(donation) {
    var from = donation[0];
    var amount = donation[1];

    app.meta.lastDonation.from = from;
    app.meta.lastDonation.amount = amount;
  });
}

function processMail(mail) {
  var from = mail[0];
  var content = mail[1];
  var timestamp = mail[2];
  decryptMail(content, false, app.account.privateKey, app.account.passphrase)
    .then(function(decryptedMail) {
      var maildata = JSON.parse(decryptedMail);
      var email = new Email(from, maildata.subject, maildata.body, timestamp);
      app.inbox.emails.splice(_.sortedIndexBy(app.inbox.emails, email, function(m) {
        return -1*m.timestamp;
      }),0,email);
    });
}

function decryptMail(encryptedMail, isSymmetric, keyOrPassword, passphrase) {
  var pgpOpts = {};
  pgpOpts.message= openpgp.message.readArmored(encryptedMail);

  if (isSymmetric) { pgpOpts.password = keyOrPassword; }
  else { pgpOpts.privateKey = openpgp.key.readArmored(keyOrPassword).keys[0]; }

  decryptKey(pgpOpts.privateKey, passphrase);

  return openpgp.decrypt(pgpOpts).then(function(decryptedContent) {
    return decryptedContent.data;
  });
}

function decryptKey(privateKey, passphrase) {
  if (passphrase.length > 0) {
    privateKey.decrypt(passphrase);
  }
}

function initializeVue() {
  app = new Vue({
    el: '#app',
    data: {
      meta: {
        isDonating: false,
        donateAmount: 1,
        lastDonation: {
          amount: 0,
          from: '0x0',
          loaded: false
        },
        web3: true
      },
      inbox: {
        emails: [],
        currentEmail: false,
        composing: [],
        ready: false,
        readNewMail: true,
        readOldMail: false
      },
      account: {
        address: '',
        exists: false,
        isGenerating: false,
        privateKey: '',
        publicKey: '',
        passphrase: '',
        password: ''
      },
      chat: {
        conversations: []
      }
    },
    methods: {
      examineMail: function(email) {
        this.inbox.currentEmail = email;
      },
      stopExamineMail: function() {
        this.inbox.currentEmail = false;
      },
      replyMail: function(email) {
        if (this.inbox.currentEmail) {
          var selected = this.inbox.currentEmail;
          this.inbox.composing.push(new Email(selected.addr, 'RE: '+selected.subject, ''));
        }
      },
      toggleNewMail: function() {
        this.inbox.readNewMail = !this.inbox.readNewMail;
      },
      toggleOldMail: function() {
        this.inbox.readOldMail = !this.inbox.readOldMail;
      },
      loadKey: function(e) {
        e.preventDefault();
        var fr = new FileReader();
        fr.onload = function() {
          app.account.privateKey = fr.result;
        };
        fr.readAsText(this.$refs.keyfile.files[0]);
      },
      generateKey: function(gen) {
        var pgpOpts = {
          userIds: [{name: this.account.address}],
          numBits: 4096,
        };
        this.account.isGenerating = true;

        if (this.account.passphrase.length > 0) {
          pgpOpts.passphrase = this.account.passphrase;
        }
        openpgp.generateKey(pgpOpts).then(function(key) {
          app.account.publicKey = key.publicKeyArmored;
          app.account.privateKey = key.privateKeyArmored;
          app.account.isGenerating = false;
        });
      },
      keyDownloadLink: function() {
        return "data:application/octet-stream;base64,"+btoa(this.account.privateKey);
      },
      login: function() {
        this.inbox.ready = true;

        loadMail();
      },
      compose: function() {
        this.inbox.composing.push(new Email('','',''));
      },
      signup: function() {
        Mail.register(this.account.publicKey, {from: app.account.address}).then(function() {
          app.account.exists = true;
        });
      },
      send: function(mail, index) {
        mail.loading = true;

        Mail.userExists.call(mail.addr, {from: app.account.address}).then(function(exists) {
          if (exists) {
            mail.encrypt(function(encryptedMail) {
              Mail.sendMail(mail.addr, encryptedMail, {from: app.account.address}).then(function() {
                mail.loading = false;
                app.close(index);
              });
            });
          } else {
            mail.loading = false;
            mail.error = "That user has no registered public key";
            setTimeout(function() {
              mail.error = "";
            }, 5000);
          }
        });
      },
      close: function(index) {
        app.inbox.composing.splice(index, 1);
      },
      openChat: function(conversation) {

      },
      toggleDonating: function() {
        this.meta.isDonating = !this.meta.isDonating;
      },
      setDonateAmount: function(amt) {
        this.meta.donateAmount = amt;
      },
      donate: function() {
        if (this.meta.donateAmount>0) {
          web3.eth.sendTransaction({
            to: Mail.address,
            from: app.account.address,
            value: web3.toWei(app.meta.donateAmount, "ether")
          }, function() {
            app.meta.isDonating = false;
          });
        }
      },
      suggest: function() {
        Mail.owner.call({from: app.account.address}).then(function(owner) {
          app.inbox.composing.push(new Email(owner, 'Ethmail.tech Feedback', 'Hey Steve, \n\nI really like X about Y, but Z could really use some work.\n\nThanks!'));
        });
      }
    }
  });
}


function Email(addr, subj, body, timestamp) {
  this.addr=addr;
  this.subject = subj;
  this.body = body;
  this.loading = false;
  this.read=true;
  this.timestamp=timestamp;
  this.error = "";

  var my = this;
  this.encrypt = function(cb) {
    Mail.userExists.call(my.addr, {from: app.account.address}).then(function (exists) {

      if (exists) {
        Mail.getPublicKey.call(my.addr, {from: app.account.address}).then(function(pubkey) {
          var pgpOpts = {
            data: JSON.stringify({subject: my.subject, body: my.body}),
            publicKeys: openpgp.key.readArmored(pubkey.replace(/\r/g, '')).keys
          };
          openpgp.encrypt(pgpOpts).then(function(encrypted) {
            this.loading = false;
            cb(encrypted.data);
          });
        });
      } else {
        return false;
      }
    });
  };
}
