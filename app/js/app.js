/* jshint -W083 */
/* jshint -W004 */

var mail = {};
var app = {};

$(document).ready(function() {
  openpgp.initWorker({ path:'js/openpgp.worker.min.js' });
  openpgp.config.use_native = false;

  initializeVue();

  Mail.userExists(app.account.address)
    .then(function(doesExist) {
      app.account.exists = doesExist;
    });
});


function loadMail() {
  var numUnread = 0;
  var numRead = 0;
  Promise.all([Mail.getUnreadSize(), Mail.getReadSize()])
  .then(function(sizes) {
    numUnread = sizes[0];
    numRead = sizes[1];

    if (app.account.privateKey) {
      for (var i=0; i<numUnread; i--) {
        Mail.loadUnread().then(function(mail) {
          decryptMail(mail, false, app.account.privateKey);

          // app.inbox.unreadMail.splice(numUnread - i, 0, decryptedMail);
        });
      }
    }

    for (var i=0; i<numRead; i--) {
      Mail.loadRead().then(function(mail) {
        // decrypt read mail with symmetric key

        // app.inbox.readMail.splice(numRead - i, 0, decryptedMail);
      });
    }
  });
}

function decryptMail(encryptedMail, isSymmetric, keyOrPassword) {
  var pgpOpts = {};
  pgpOpts.message= openpgp.message.readArmored(encryptedMail);

  if (isSymmetric) { pgpOpts.password = keyOrPassword; }
  else { pgpOpts.privateKey = keyOrPassword; }

  return openpgp.decrypt(pgpOpts).then(function(decryptedContent) {
    return decryptedContent.data;
  });
}

function initializeVue() {
  app = new Vue({
    el: '#app',
    data: {
      inbox: {
        readEmails: [],
        unreadEmails: [],
        currentEmail: false,
        composing: [],
        ready: false,
        readNewMail: false,
        readOldMail: false
      },
      account: {
        address: web3.eth.defaultAccount ? web3.eth.defaultAccount : web3.eth.accounts[0],
        exists: false,
        isGenerating: false,
        privateKey: '',
        publicKey: '',
        passphrase: '',
        password: ''
      }
    },
    methods: {
      examineMail: function(email) {
        this.inbox.currentEmail = email;
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
        Mail.register(this.account.address).then(function() {
          app.account.exists = true;
        });
      }
    },
    computed: {
      signupReady: function() {
        return this.account.publicKey.length > 0 && this.account.privateKey.length > 0;
      }
    }
  });
}


function Email(to, subj, body) {
  this.to=to;
  this.subject = subj;
  this.body = body;

  this.encrypt = function() {
    Mail.userExists(to).then(function (exists) {
      if (exists) {
        Mail.getPublicKey(to).then(function(pubkey) {
          var pgpOpts = {
            data: ethmailcontent,
            publicKeys: openpgp.key.readArmored(pubkey.replace(/\r/g, '')).keys
          };
          openpgp.encrypt(pgpOpts).then(function(encrypted) {
            return encrypted;
          });
        });
      } else {
        return false;
      }
    });
  };

  var me = this;
  this.send = function() {
    Mail.sendMail(to, me.encrypt()).then(function() {
      app.inbox.composing.remove(me);
    });
  };

}
