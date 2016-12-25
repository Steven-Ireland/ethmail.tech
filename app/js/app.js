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
      for (var i=0; i<numUnread; i++) {
        Mail.loadUnread(i).then(function(mail) {
          var from = mail[0];
          var content = mail[1];
          decryptMail(content, false, app.account.privateKey)
            .then(function(decryptedMail) {
              var maildata = JSON.parse(decryptedMail);
              app.inbox.emails.splice(0,0,new Email(from, maildata.subject, maildata.body));
            });
        });
      }
    }

    /*for (var i=0; i<numRead; i++) {
      Mail.loadRead(i).then(function(mail) {
        // decrypt read mail with symmetric key
      });
    }*/
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
        console.log(email);
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
        Mail.register(this.account.publicKey).then(function() {
          app.account.exists = true;
        });
      },
      send: function(mail, idx) {
        mail.loading = true;
        mail.encrypt(function(encryptedMail) {
          Mail.sendMail(mail.addr, encryptedMail).then(function() {
            mail.loading = false;
            app.inbox.composing.splice(idx, 1);
          });
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


function Email(addr, subj, body) {
  this.addr=addr;
  this.subject = subj;
  this.body = body;
  this.loading = false;
  this.read=true;

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
