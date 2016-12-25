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
  Mail.getUnreadSize().then(function(size) {
    numUnread = size;

    if (app.account.privateKey) {
      for (var i=0; i<numUnread; i++) {
        Mail.loadUnread(i).then(function(mail) {
          processMail(mail);
        });
      }

      web3.eth.filter("latest").watch(function(err, res) {
        checkForMoreMail(numUnread).then(function(num) {
          numUnread = num;
        });
      });
    }
  });
}

function checkForMoreMail(lastCount) {
  Mail.getUnreadSize().then(function(size) {
    if (size > lastCount) {
      console.log("Maiiiil time!");
      for (var i=lastCount; i < size; i++) {
        Mail.loadUnread(i).then(function(mail) {
          processMail(mail);
          console.log("Found more mails!");
        });
      }
    }
    return size;
  });
}

function processMail(mail) {
  var from = mail[0];
  var content = mail[1];
  var timestamp = mail[2];
  decryptMail(content, false, app.account.privateKey)
    .then(function(decryptedMail) {
      var maildata = JSON.parse(decryptedMail);
      var email = new Email(from, maildata.subject, maildata.body, timestamp);
      app.inbox.emails.splice(_.sortedIndexBy(app.inbox.emails, email, function(m) {
        return -1*m.timestamp;
      }),0,email);
    });
}

function decryptMail(encryptedMail, isSymmetric, keyOrPassword) {
  var pgpOpts = {};
  pgpOpts.message= openpgp.message.readArmored(encryptedMail);

  if (isSymmetric) { pgpOpts.password = keyOrPassword; }
  else { pgpOpts.privateKey = openpgp.key.readArmored(keyOrPassword).keys[0]; }

  return openpgp.decrypt(pgpOpts).then(function(decryptedContent) {
    return decryptedContent.data;
  });
}

function initializeVue() {
  app = new Vue({
    el: '#app',
    data: {
      inbox: {
        emails: [],
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
      stopExamineMail: function() {
        this.inbox.currentEmail = false;
      },
      replyMail: function(email) {
        // todo
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
        Mail.register(this.account.publicKey).then(function() {
          app.account.exists = true;
        });
      },
      send: function(mail, index) {
        mail.loading = true;
        mail.encrypt(function(encryptedMail) {
          Mail.sendMail(mail.addr, encryptedMail).then(function() {
            mail.loading = false;
            app.close(index);
          });
        });
      },
      close: function(index) {
        app.inbox.composing.splice(index, 1);
      }
    },
    computed: {
      signupReady: function() {
        return this.account.publicKey.length > 0 && this.account.privateKey.length > 0;
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

  var my = this;
  this.encrypt = function(cb) {
    Mail.userExists(my.addr).then(function (exists) {

      if (exists) {
        Mail.getPublicKey(my.addr).then(function(pubkey) {
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
