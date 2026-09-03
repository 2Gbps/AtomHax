var el = document.getElementsByClassName("gameframe")[0];
var muted = new Set();
var myNick;
var searchCreated = false;
var buttonCreated = false;

function waitForElement(selector) {
  return new Promise(function(resolve) {
    var gameframe = document.getElementsByClassName("gameframe")[0];
    if (!gameframe || !gameframe.contentWindow || !gameframe.contentWindow.document) {
      var outerObs = new MutationObserver(function() {
        var gf = document.getElementsByClassName("gameframe")[0];
        if (gf && gf.contentWindow && gf.contentWindow.document) {
          outerObs.disconnect();
          waitForElement(selector).then(resolve);
        }
      });
      outerObs.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    var element = gameframe.contentWindow.document.querySelector(selector);
    if (element) { resolve(element); return; }
    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        var nodes = Array.from(mutation.addedNodes);
        for (var node of nodes) {
          if (node.matches && node.matches(selector)) { resolve(node); return; }
        }
      });
    });
    observer.observe(gameframe.contentWindow.document, { childList: true, subtree: true });
  });
}

function mutePlayer(name) {
  if (muted.has(name)) { muted.delete(name); }
  else { muted.add(name); }
}

function linkify(text) {
  var urlRegex = /(\b(https?:\/\/|ftp:\/\/|file:\/\/|www\.)[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
  return text.replace(urlRegex, function(url) {
    if (url.startsWith('www.')) { url = 'http://' + url; }
    return '<a href="' + url + '" target="_blank">' + url + '</a>';
  });
}

function simulateClick(item) {
  item.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
  item.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
  item.dispatchEvent(new PointerEvent('pointerup', {bubbles: true}));
  item.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
  item.dispatchEvent(new MouseEvent('mouseout', {bubbles: true}));
  item.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  item.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
}

function changeView(viewIndex) {
  if (5 <= viewIndex && viewIndex <= 8) {
    var gameframe = document.getElementsByClassName('gameframe')[0];
    gameframe.contentWindow.document.querySelector('[data-hook="settings"]').click();
    var viewModeToggle = waitForElement('[data-hook="viewmode"]');
    viewModeToggle.then(function(toggle) {
      toggle.selectedIndex = viewIndex;
      simulateClick(toggle);
      var closeBtn = waitForElement('[data-hook="close"]');
      closeBtn.then(function(btn) { btn.click(); });
    });
  }
}

var noticeRe = new RegExp('.*(?= (has joined|was moved))', 'g');

var chatObserver = new MutationObserver(function(mutations) {
  var candidates = mutations.flatMap(function(x) { return Array.from(x.addedNodes); }).filter(function(x) { return x.tagName == 'P'; });
  var gameframe = document.documentElement.getElementsByClassName("gameframe")[0];
  if (!gameframe || !gameframe.contentWindow) return;
  var chatInput = gameframe.contentWindow.document.querySelector('[data-hook="input"]');

  var chatCheck = function(chatLine) {
    if ([].concat(Array.from(muted)).filter(function(x) { return chatLine.innerText.startsWith(x + ': '); }).length > 0) {
      chatLine.hidden = true;
    }

    if (!chatLine.processed) {
      chatLine.innerHTML = linkify(chatLine.innerHTML);
    }

    chatLine.oncontextmenu = function() {
      if (chatLine.innerText.includes(':')) {
        var chatAuthor = chatLine.innerText.split(':')[0].replace(' ', '_');
        chatInput.value += ' @' + chatAuthor + ' ';
        chatInput.focus();
        return false;
      }
      else if (chatLine.className === 'notice' && chatLine.innerText.match(noticeRe)) {
        var chatAuthor = chatLine.innerText.match(noticeRe)[0].replace(' ', '_');
        chatInput.value += ' @' + chatAuthor + ' ';
        chatInput.focus();
        return false;
      }
    };
  };
  candidates.forEach(function(x) { chatCheck(x); });
});

function handleView(tempView) {
  if (tempView == 'chat-row') return;
  if (tempView != 'roomlist-view') {
    searchCreated = false;
    buttonCreated = false;
  }
  switch (true) {
    case tempView == "choose-nickname-view":
      waitForElement('[data-hook="input"]').then(function(nicknameInput) {
        myNick = nicknameInput.value;
      });
      break;

    case tempView == "roomlist-view":
      var gf = document.getElementsByClassName('gameframe')[0];
      var stillThere = gf && gf.contentDocument && gf.contentDocument.getElementById('searchRoom');
      if (!stillThere) {
        searchCreated = false;
        buttonCreated = false;
      }
      if (!searchCreated) { searchCreated = true; createSearch(); }
      if (!buttonCreated) { buttonCreated = true; createButton(); }
      break;

    case tempView.includes("game-view"):
      muted = new Set();
      searchCreated = false;
      buttonCreated = false;
      waitForElement('[data-hook="log"]').then(function(chatArea) {
        chatObserver.observe(chatArea, { childList: true, subtree: true });
      });
      var gf = document.getElementsByClassName("gameframe")[0];
      if (gf && gf.contentWindow && gf.contentWindow.document) {
        gf.contentWindow.document.onkeydown = function(f) {
          if (f.key >= 5 && f.key <= 8) { changeView(f.key); }
        };
      }
      break;

    case tempView == "dialog":
      var popupWait = waitForElement('div.dialog');
      popupWait.then(function(popup) {
        if (!popup || !popup.firstChild) return;
        var name = popup.firstChild.innerText;
        var muteBtn = document.createElement('button');
        muteBtn.className = 'mb';
        popup.insertBefore(muteBtn, popup.lastChild);
        muteBtn.innerText = muted.has(name) ? 'Unmute' : 'Mute';
        muteBtn.onclick = function() {
          if (muted.has(name)) {
            muted.delete(name);
            muteBtn.innerText = 'Mute';
          } else {
            muted.add(name);
            muteBtn.innerText = 'Unmute';
          }
        };
        var tagBtn = document.createElement('button');
        tagBtn.className = 'tag';
        tagBtn.innerText = '@Mention';
        popup.insertBefore(tagBtn, popup.lastChild);
        tagBtn.onclick = function() {
          var gameframe = document.getElementsByClassName('gameframe')[0];
          var chatInput = gameframe.contentWindow.document.querySelector('[data-hook="input"]');
          var tagName = name.replace(' ', '_');
          chatInput.value += ' @' + tagName + ' ';
          popup.lastChild.click();
          chatInput.focus();
        };
      });
      break;
  }
}

var moduleObserver = new MutationObserver(function(mutations) {
  var candidates = mutations.flatMap(function(x) { return Array.from(x.addedNodes); }).filter(function(x) { return x.className; });
  if (candidates.length == 1) {
    var tempView = candidates[0].className;
    handleView(tempView);
  }
});

// Start observer: wait for gameframe to exist, then watch for view changes
function startObserver() {
  var gameframe = document.getElementsByClassName("gameframe")[0];
  if (!gameframe || !gameframe.contentWindow || !gameframe.contentWindow.document) {
    setTimeout(startObserver, 200);
    return;
  }
  var doc = gameframe.contentWindow.document;
  var target = doc.querySelector("div[class$='view']");
  if (target && target.parentNode) {
    moduleObserver.observe(target.parentNode, { childList: true, subtree: true });
    handleView(target.className);
  } else {
    var firstObs = new MutationObserver(function() {
      var v = doc.querySelector("div[class$='view']");
      if (v && v.parentNode) {
        firstObs.disconnect();
        moduleObserver.observe(v.parentNode, { childList: true, subtree: true });
        handleView(v.className);
      }
    });
    firstObs.observe(doc, { childList: true, subtree: true });
  }
}

startObserver();
