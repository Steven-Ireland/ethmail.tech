pragma solidity ^0.4.6;

contract Mail {

  address public owner;
  function Mail() {
    owner = msg.sender;
  }

  function changeOwner(address newOwner) onlyOwner {
    if (msg.sender == owner) {
      owner = newOwner;
    } else throw;
  }

  struct Email {
    address from;
    string content;
    uint timestamp;
  }

  struct EmailAddr {
    string public_key;
    string preferences;
    Email[] read;
    Email[] unread;
  }

  mapping (address => EmailAddr) users;

  modifier onlyOwner {
    if (msg.sender != owner) throw;
    _;
  }

  function () payable {
    // thanks for your contribution :)
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

  function loadRead(uint recent) constant returns(address, string) {
    if (userExists(msg.sender)) {
      return (users[msg.sender].read[recent].from,
              users[msg.sender].read[recent].content);
    } else {
      return (owner, "An Error has Occured");
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

  function getReadSize() constant returns (uint) {
    if (userExists(msg.sender)) {
      return users[msg.sender].read.length;
    } else {
      return 0;
    }
  }

  function sendMail(address addr, string hash) {
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
