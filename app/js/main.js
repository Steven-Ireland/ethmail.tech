$(document).ready(function() {
  openpgp.config.aead_protect = true;
  //openpgp.initWorker({ path:'openpgp.worker.js' }); // set the relative web worker path

  $('#compose').click(function(e) {
    e.preventDefault();

    var emailTemplate = $('#emailTemplate').html();
    wireEmail($(Mustache.render(emailTemplate)));
  });

  $('#login').click(function(e) {
    e.preventDefault();

    var loginTemplate = $('#loginTemplate').html();
    wireLogin($(Mustache.render(loginTemplate)));
  });

  Mail.userExists(web3.eth.defaultAccount).then(function(exists) {
    if (!exists) {
      var registerTemplate = $('#registerTemplate').html();
      wireRegister($(Mustache.render(registerTemplate)));
    } else {
      if (Lockr.get('privatekey') && Lockr.get('passphrase')) {
        loadKey(Lockr.get('privatekey'), Lockr.get('passphrase'), function() {
          loadMail();
        });
      }
    }
  });

});

function loadMail() {
  $('#login').remove();
  populateInbox();
  var filter = web3.eth.filter('latest');
  filter.watch(function(error, result){
    retrieveNewMail();
  });
}

function saveMail(mail) {
  var pgpopts = {
    data: mail,
    password: [passPhrase],
  };
  openpgp.encrypt(pgpopts).then(function(encrypted) {

  });
}

var lastCount = 0;
function retrieveNewMail() {
  var lineTemplate = $('#inboxLineTemplate').html();
  Mail.getIncomingSize().then(function(count) {
    if (count > lastCount) {
      for (lastCount; lastCount < count; lastCount++) {
        Mail.loadIncomingMail(lastCount).then(function(content) {
          var encryptedContent = content[1];
          var pgpOpts = {
            message: openpgp.message.readArmored(encryptedContent),
            privateKey: privateKey,
          };
          openpgp.decrypt(pgpOpts)
          .then(function(decryptedContent) {
            // reencrypt and save mail with passphrase
            var mail = decryptedContent.data;
            saveMail(mail);
            $('#inbox').prepend(Mustache.render(lineTemplate,
              {from: content[0], content: subj}));
          });
        }); // todo ipfs hash
      }
    }
  });
}

function wireEmail(email) {
  email.submit(function(e) {
    e.preventDefault();


    var to = $(this).find('.to').val();
    var subject = $(this).find('.subject').val();
    var content = $(this).find('.content').val();

    var ethmailcontent = JSON.stringify({
      subject: subject,
      content: content
    });

    Mail.userExists(to).then(function (exists) {
      if (exists) {
        Mail.getPublicKey(to).then(function(pubkey) {
          var pgpOpts = {
            data: ethmailcontent,
            publicKeys: openpgp.key.readArmored(pubkey.replace(/\r/g, '')).keys
          };
          openpgp.encrypt(pgpOpts)
          .then(function(encrypted) {
            Mail.sendMail(to, encrypted.data).then(function() {
              email.remove();
            });
          });
        });
      } else {

      }
    });
    // do ipfs stuff

  });

  email.find('.close').click(function(e) {
    e.preventDefault();
    email.remove();
  });

  $('#overlay').append(email);
}

function wireRegister(register) {
  register.submit(function(e) {
    e.preventDefault();

    var key = $('#public_key').val().replace(/\r/g, '');
    Mail.register(key).then(function() {
      register.remove();
    });
  });

  register.find('#PGPgenerate').click(function(e) {
    e.preventDefault();

    var PGPpassphrase = register.find('#PGPpassphrase').val();
    var pgpOpts = {
      userIds: [{name: web3.eth.defaultAccount}],
      numBits: 4096,
      passphrase: PGPpassphrase
    };
    openpgp.generateKey(pgpOpts).then(function(key) {
      register.find('#PGPnewpublic').val(key.publicKeyArmored);
      register.find('#PGPnewprivate').val(key.privateKeyArmored);
    });
  });

  $('#overlay').append(register);
}

var privateKey;
var passPhrase;
function wireLogin(login) {
  login.submit(function(e) {
    e.preventDefault();


    var passphrase = login.find("#PGPpassphrase").val();
    var privatekey = login.find("#PGPprivate").val().replace(/\r/g, '');

    loadKey(privatekey, passphrase, function() {
      login.remove();

      Lockr.set('privatekey', privatekey);
      Lockr.set('passphrase', passphrase);
      loadMail();
    })
  });

  $('#overlay').append(login);
}
function loadKey(privKey, passphrase, cb) {
  var pgpOpts = {
    privateKey: openpgp.key.readArmored(privKey).keys[0],
    passphrase: passphrase
  };
  openpgp.decryptKey(pgpOpts)
  .then(function(decryptedKey) {
    privateKey =  decryptedKey.key;
    passPhrase = passphrase;
    cb();
  });
}
