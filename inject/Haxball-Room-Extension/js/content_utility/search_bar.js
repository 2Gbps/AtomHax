// search bar by Raamyy and xenon (styled to match client dark glass design)
(function() {
  var _nyxRaf = null;
  var _nyxLastValue = null;
  var _nyxRoomCache = null;

  function scheduleSearch(input) {
    if (_nyxRaf) cancelAnimationFrame(_nyxRaf);
    _nyxRaf = requestAnimationFrame(function() {
      _nyxRaf = null;
      chrome.storage.local.set({ 'haxRoomSearchTerm': input.value });
      searchForRoom();
    });
  }

  function createSearch() {
    var gameframe = document.getElementsByClassName("gameframe")[0];
    if (!gameframe || !gameframe.contentDocument) return;
    var dialog = gameframe.contentDocument.getElementsByClassName("dialog")[0];
    if (!dialog) return;
    var refreshButton = gameframe.contentWindow.document.querySelector('button[data-hook="refresh"]');
    if (!refreshButton) return;

    var joinButtonObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (!refreshButton.disabled) {
          _nyxRoomCache = null;
          searchForRoom();
        }
      });
    });
    joinButtonObserver.observe(refreshButton, { attributes: true });

    var cs = gameframe.contentWindow.getComputedStyle(refreshButton);
    var btnFont = cs.font || '14px "Open Sans", sans-serif';
    var btnBorderRadius = cs.borderRadius || '4px';
    var btnH = (cs.height && cs.height !== 'auto' && parseFloat(cs.height) > 0) ? cs.height : '28px';

    var input = document.createElement('input');
    input.type = "search";
    input.id = "searchRoom";
    input.placeholder = "Search Rooms";
    input.autocomplete = "off";
    input.style.cssText = "display:block !important;width:100% !important;height:" + btnH + " !important;padding:0 10px !important;border-radius:" + btnBorderRadius + " !important;border:1px solid rgba(255,255,255,0.15) !important;background:rgba(255,255,255,0.06) !important;color:#fff !important;font:" + btnFont + " !important;outline:none !important;box-sizing:border-box !important;margin:10px 0 !important;";

    chrome.storage.local.get({ 'haxRoomSearchTerm': '' }, function(result) {
      input.value = result.haxRoomSearchTerm;
      _nyxRoomCache = null;
      if (input.value) searchForRoom();
    });

    input.oninput = function() { scheduleSearch(input); };
    input.onkeyup = function(e) {
      if (e.keyCode === 27) {
        input.value = '';
        scheduleSearch(input);
      }
    };

    var insertPos = dialog.querySelector('h1').nextElementSibling;
    if (!insertPos) return;
    var spacer = document.createElement('div');
    spacer.style.cssText = 'height:5px;flex:0 0 auto;';
    insertPos.parentNode.insertBefore(spacer, insertPos.nextElementSibling);
    insertPos.parentNode.insertBefore(input, spacer);

    fixNameColumnAlignment(gameframe);
  }

  function buildRoomCache(dialog) {
    var roomTable = dialog.querySelector("[data-hook='list']");
    if (!roomTable) return [];
    var rows = roomTable.rows;
    var cache = new Array(rows.length);
    for (var i = 0, len = rows.length; i < len; i++) {
      var room = rows[i];
      var roomNameEl = room.querySelector("[data-hook='name']");
      var roomPlayersEl = room.querySelector("[data-hook='players']");
      if (!roomNameEl || !roomPlayersEl) {
        cache[i] = null;
        continue;
      }
      var roomName = roomNameEl.textContent.toLowerCase();
      var playersText = roomPlayersEl.textContent;
      var slashIdx = playersText.indexOf('/');
      cache[i] = {
        el: room,
        name: roomName,
        compact: roomName.replace(/\s/g, ''),
        numPlayers: slashIdx > -1 ? playersText.substring(0, slashIdx) : playersText,
        maxPlayers: slashIdx > -1 ? playersText.substring(slashIdx + 1) : ''
      };
    }
    return cache;
  }

  function searchForRoom() {
    var gameframe = document.getElementsByClassName("gameframe")[0];
    if (!gameframe || !gameframe.contentDocument) return;
    var dialog = gameframe.contentDocument.getElementsByClassName("dialog")[0];
    if (!dialog) return;
    var input = gameframe.contentWindow.document.getElementById('searchRoom');
    if (!input) return;

    var raw = input.value.toLowerCase();
    if (_nyxLastValue === raw) return;
    _nyxLastValue = raw;

    var rexp = /([^\/]+)?\/?(\d+)?/.exec(raw);
    var rawTerms = rexp[1] ? rexp[1] : '';
    var playerMax = rexp[2];
    var searchTerms = rawTerms.split('+').filter(function(x) { return x !== ''; });
    for (var t = 0; t < searchTerms.length; t++) searchTerms[t] = searchTerms[t].trim();
    var hasPlayerMax = typeof playerMax !== 'undefined';

    if (!_nyxRoomCache) _nyxRoomCache = buildRoomCache(dialog);
    var cache = _nyxRoomCache;
    var totalNumberOfPlayers = 0;
    var totalNumberOfRooms = 0;

    for (var i = 0, len = cache.length; i < len; i++) {
      var item = cache[i];
      if (!item) continue;

      var playerTest = !hasPlayerMax || playerMax === item.maxPlayers;
      var nameTest = false;
      if (searchTerms.length === 0) {
        nameTest = true;
      } else {
        for (var k = 0; k < searchTerms.length; k++) {
          var term = searchTerms[k];
          var termParts = term.split(' ');
          var matchesNormal = true;
          var matchesCompact = true;
          for (var p = 0; p < termParts.length; p++) {
            var part = termParts[p];
            if (part && item.name.indexOf(part) === -1) matchesNormal = false;
            if (part && item.compact.indexOf(part) === -1) matchesCompact = false;
          }
          if (matchesNormal || matchesCompact) { nameTest = true; break; }
        }
      }

      if (nameTest && playerTest) {
        if (item.el.hidden) item.el.hidden = false;
        totalNumberOfPlayers += parseInt(item.numPlayers, 10) || 0;
        totalNumberOfRooms++;
      } else {
        if (!item.el.hidden) item.el.hidden = true;
      }
    }

    var roomsStats = dialog.querySelector("[data-hook='count']");
    if (roomsStats) roomsStats.textContent = totalNumberOfPlayers + " players in " + totalNumberOfRooms + " filtered rooms";
    var listScroll = dialog.querySelector("[data-hook='listscroll']");
    if (listScroll) listScroll.scrollTo(0, 0);
  }

  function fixNameColumnAlignment(gameframe) {
    var style = gameframe.contentWindow.document.createElement('style');
    style.textContent = ".roomlist-view table.header th:first-child, .roomlist-view table td:first-child { padding-left: 12px !important; }";
    gameframe.contentWindow.document.head.appendChild(style);
  }

  window.createSearch = createSearch;
})();