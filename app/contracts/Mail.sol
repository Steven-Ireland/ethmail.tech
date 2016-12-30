pragma solidity ^0.4.6;

contract Mail {

  address public owner;
  function Mail() {
    owner = msg.sender;
  }

  function changeOwner(address newOwner) onlyOwner {
  owner = newOwner;
  }

  modifier onlyOwner {
    if (msg.sender != owner) throw;
    _;
  }

  // The cost here can be two-fold, but I see one use in particular: stopping spam.
  // If there is nontrivial-en-masse cost with sending emails (which may take some adjusting!) spamming becomes unprofitable.
  // See: Teslas's charge for sitting at a supercharger station.
  uint cost = 0;
  function changeCost(uint newCost) onlyOwner {
    cost = newCost;
  }

  modifier costs {
    if (msg.value >= cost) {
      _;
      uint diff = msg.value - cost;
      if (diff > 0) {
        if (!msg.sender.send(diff)) {
          throw;
        }
      }
    } else {
      throw;
    }
  }

  struct Email {
    address from;
    string content;
    uint timestamp;
  }

  struct EmailAddr {
    string public_key;
    string preferences;
    Email[] unread;
  }

  struct Donation {
    address from;
    uint amount;
    uint blockNumber;
  }

  mapping (address => EmailAddr) users;

  Donation public lastDonation;
  function () payable {
    if (lastDonation.amount < msg.value ||
        lastDonation.blockNumber < block.number) {

      lastDonation = Donation(msg.sender, msg.value, block.number);
    }
  }

  function retrieveDonations() onlyOwner {
    if (!owner.send(this.balance)) {
      throw;
    }
  }

  function register(string public_key) {
    users[msg.sender].public_key = public_key;
  }

  function savePreferences(string preferences) {
    if (userExists(msg.sender)) {
      users[msg.sender].preferences = preferences;
    }
  }

  function loadPreferences() constant returns (string) {
    if (userExists(msg.sender)) {
      return users[msg.sender].preferences;
    } else {
      return 'An Error has Occured';
    }
  }

  function loadUnread(uint recent) constant returns(address, string, uint) {
    if (userExists(msg.sender)) {
      return (users[msg.sender].unread[recent].from,
              users[msg.sender].unread[recent].content,
              users[msg.sender].unread[recent].timestamp);
    } else {
      return (owner, "An Error has Occured", 0);
    }
  }

  function getUnreadSize() constant returns (uint) {
    if (userExists(msg.sender)) {
      return users[msg.sender].unread.length;
    } else {
      return 0;
    }
  }

  function sendMail(address addr, string hash) payable costs {
    if (userExists(addr)) {
      users[addr].unread.push(Email(msg.sender, hash, block.timestamp));
    } else throw;
  }

  function userExists(address addr) public constant returns (bool) {
    return bytes(users[addr].public_key).length != 0;
  }

  function getPublicKey(address addr) public constant returns (string) {
    return users[addr].public_key;
  }

}
