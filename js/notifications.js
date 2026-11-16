window.AT = window.AT || {};

window.AT.notifications = (function() {
  let messaging = null;
  let db = null;

  const firebaseConfig = {
    apiKey: "AIzaSyD34-PHB3DmI2pAoYXkPs8s-AZSo0UBeEg",
    authDomain: "trading-974f1.firebaseapp.com",
    projectId: "trading-974f1",
    storageBucket: "trading-974f1.firebasestorage.app",
    messagingSenderId: "421347887514",
    appId: "1:421347887514:web:af34e0571d7bf6389b5223"
  };

  const VAPID_KEY = "BDWTopy1ZAxzDrey2JSAUY8EdMm5BTw_VV_-Kx-p6JoNy0XknbbKO2RFd1jcgDaq2xnbJ8ljmE7EoTqUaL2Knpk";

  function init() {
    if (!window.firebase) return;
    
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    
    messaging = firebase.messaging();
    db = firebase.firestore();

    const btn = document.getElementById('btnActivateNotif');
    
    if (Notification.permission === 'granted') {
      updateButton(true);
      getToken();
    } else if (Notification.permission === 'denied') {
      updateButton(false, '🚫 Bloqueadas');
      if (btn) btn.disabled = true;
    } else {
      updateButton(false);
      if (btn) {
        btn.addEventListener('click', requestPermission);
      }
    }

    messaging.onMessage(function(payload) {
      if (Notification.permission === 'granted') {
        new Notification(payload.notification.title, {
          body: payload.notification.body,
          icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933190.png'
        });
      }
    });
  }

  function updateButton(active, text) {
    const btn = document.getElementById('btnActivateNotif');
    if (!btn) return;
    
    if (active) {
      btn.textContent = '✅ Notificaciones Activadas';
      btn.classList.add('active');
      btn.disabled = true;
    } else if (text) {
      btn.textContent = text;
    }
  }

  function requestPermission() {
    const btn = document.getElementById('btnActivateNotif');
    if (btn) btn.textContent = '⏳ Solicitando...';

    Notification.requestPermission().then(function(permission) {
      if (permission === 'granted') {
        updateButton(true);
        getToken();
        showTestNotification();
      } else {
        updateButton(false, '❌ Permiso denegado');
        if (btn) btn.disabled = true;
      }
    });
  }

  function getToken() {
    messaging.getToken({ vapidKey: VAPID_KEY }).then(function(currentToken) {
      if (currentToken) {
        db.collection('tokens').doc(currentToken).set({
          token: currentToken,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          activo: true
        }).then(function() {
          console.log('Token FCM guardado en Firestore.');
        }).catch(function(err) {
          console.error('Error al guardar token en Firestore:', err);
        });
      }
    }).catch(function(err) {
      console.error('Error al obtener el token:', err);
    });
  }

  function showTestNotification() {
    if (Notification.permission === 'granted') {
      new Notification('¡Notificaciones Activadas!', {
        body: 'Market Consensus PRO te avisará cuando haya una oportunidad de compra o venta.',
        icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933190.png'
      });
    }
  }

  return { init: init };
})();