var app = angular.module('webRebellion', [
  'luegg.directives',
  'ui.bootstrap',
]);

app.controller('BaseController', function($http, $scope) {
  $scope.messages = [];
  $scope.disconnectedBy = null;

  $scope.formatTime = function(unixtime) {
    var date = new Date(unixtime * 1000);
    var hours = date.getHours();
    if (hours < 10) {
      hours = "0" + hours;
    }
    var mins = date.getMinutes();
    if (mins < 10) {
      mins = "0" + mins;
    }
    var seconds = date.getSeconds();
    if (seconds < 10) {
      seconds = "0" + seconds;
    }
    return hours + ":" + mins + ":" + seconds;
  }

  $scope.sendChat = function(message) {
    $http.post('/chat', {message: message});
    $scope.msg = '';
  }

  $scope.receiveChat = function(event) {
    $scope.$apply(function() {
      $scope.messages.push(JSON.parse(event.data));
    });
  }

  $scope.disconnected = function(event) {
    $scope.$apply(function() {
      $scope.disconnectedBy = event.data;
    });
  }
});

app.controller('GameController', function($controller, $http, $scope, $window) {
  $controller('BaseController', {$scope: $scope});
  // These just so we don't err on a formatDecision immediately.
  $scope.game = {
    decision_makers: [],
    decision_choices: [],
    watchers: [],
  };
  $scope.gameMessages = [];
  $scope.labelToConfirm = null;
  $scope.choiceToConfirm = null;
  $scope.choiceError = null;
  $scope.choiceArgs = [];

  $http.get('/game.json').success(function(data, status, headers, config) {
    $scope.game = data;
  });

  $scope.formatDecision = function(game) {
    return game.decision + " - Waiting on " + game.decision_makers.join(', ') +
      " to choose between " + game.decision_choices.join(', ');
  }

  $scope.currentArg = function() {
    if (!$scope.choiceToConfirm || $scope.choiceArgs.length >= $scope.choiceToConfirm.args.length) {
      return {};
    }
    return $scope.choiceToConfirm.args[$scope.choiceArgs.length];
  }

  $scope.formatArg = function(arg) {
    var str = arg.type;
    if (arg.richest) {
      str += " (richest)";
    }
    if (arg.poorest) {
      str += " (poorest)";
    }
    return str;
  }

  $scope.needPlayerArg = function() {
    return $scope.currentArg().type == 'player';
  }

  $scope.canTargetSelf = function() {
    return $scope.currentArg().self;
  }

  $scope.needRoleArg = function() {
    return $scope.currentArg().type == 'role';
  }

  var tryAutoChoice = function(label, choice) {
    // Is there only one other target?
    var onlyTarget = null;
    var targetsFound = 0;
    for (var i in $scope.game.players) {
      var player = $scope.game.players[i];
      if (!player.alive || player.username == $scope.game.my_username) {
        continue;
      }
      onlyTarget = player;
      ++targetsFound;
      if (targetsFound > 1) {
        // Give up now.
        return;
      }
    }
    if (targetsFound == 1) {
      $scope.addPlayerArg(onlyTarget);
    }
  }

  $scope.makeChoice = function(label, choice) {
    if (choice.args.length > 0) {
      $scope.labelToConfirm = label;
      $scope.choiceToConfirm = choice;

      // If this choice requires a single target,
      // and it's not possible to choose myself,
      // we may be able to auto-fill the target in a 2p game.
      if (choice.args.length == 1 && $scope.game.num_living_players == 2 && !choice.args[0].self) {
        tryAutoChoice(label, choice);
      }
    } else {
      sendChoice(label, []);
    }
  }

  $scope.resetChoice = function() {
    $scope.labelToConfirm = null;
    $scope.choiceToConfirm = null;
    $scope.choiceArgs = [];
  }

  $scope.addPlayerArg = function(player) {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    $scope.choiceArgs.push({type: "player", value: player.username});

    // Auto-send choice if all args have been given.
    if ($scope.choiceArgs.length >= $scope.choiceToConfirm.args.length) {
      sendChoice($scope.labelToConfirm, $scope.choiceArgs);
    }
  }

  $scope.addRoleArg = function(role) {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    $scope.choiceArgs.push({type: "role", value: role});

    // Auto-send choice if all args have been given.
    if ($scope.choiceArgs.length >= $scope.choiceToConfirm.args.length) {
      sendChoice($scope.labelToConfirm, $scope.choiceArgs);
    }
  }

  $scope.deleteArg = function() {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    $scope.choiceArgs.pop();
  }

  var sendChoice = function(label, args) {
    $scope.choiceError = null;
    $http.post('/game/choice', {
      choice: label,
      args: args,
    }).success(function(data, status, headers, config) {
      $scope.resetChoice();
    }).error(function(data, status, headers, config) {
      $scope.choiceError = data;
    });
  }

  $scope.leaveGame = function() {
    $scope.choiceError = null;
    $http.post('/game/leave').success(function(data, status, headers, config) {
      $window.location.href = '/games';
    });
  }

  var onGameMessage = function(event) {
    $scope.$apply(function() {
      $scope.gameMessages.push(JSON.parse(event.data));
    });
  }

  var onGameUpdate = function(event) {
    $scope.$apply(function() {
      var game = JSON.parse(event.data);
      $scope.game = game;

      var message;
      if (game.winner) {
        message = 'Congratulations! ' + game.winner + ' is the winner!';
      }
      else {
        var prefix = 'Turn ' + game.turn + ': ';
        message = prefix + $scope.formatDecision(game);
      }
      $scope.gameMessages.push({
        message: message,
        time: game.time,
      });
    });
  }

  var onWatchersUpdate = function(event) {
    $scope.$apply(function() {
      $scope.game.watchers = JSON.parse(event.data);
    });
  }

  var es = new EventSource('/stream');
  es.addEventListener('chat.game', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
  es.addEventListener('game.message', onGameMessage, false);
  es.addEventListener('game.update', onGameUpdate, false);
  es.addEventListener('watchers.update', onWatchersUpdate, false);
});

app.controller('LobbyController', function($controller, $http, $scope, $window) {
  $controller('BaseController', {$scope: $scope});
  $scope.users = [];
  $scope.games = [];
  $scope.selectedUsernames = [];
  $scope.selectedRoles = ['banker', 'director', 'guerrilla', 'politician', 'peacekeeper'];
  $scope.currentProposal = null;
  $scope.lastProposal = null;
  $scope.myUsername = null;

  var allRoles = {
    finance: {
      basic: ['banker', 'farmer', 'spy'],
      advanced: ['speculator', 'capitalist'],
    },
    communications: {
      basic: ['director', 'reporter', 'newscaster'],
      advanced: ['writer', 'producer'],
    },
    force: {
      basic: ['guerrilla', 'judge', 'general'],
      advanced: ['mercenary', 'crime_boss'],
    },
    special_interests: {
      basic: ['politician', 'lawyer', 'peacekeeper', 'intellectual'],
      advanced: ['priest', 'communist', 'foreign_consular', 'customs_officer', 'protestor', 'missionary'],
    },
  }

  $http.get('/games.json').success(function(data, status, headers, config) {
    $scope.myUsername = data.username;
    $scope.users = data.users;
    $scope.games = data.games;
    $scope.currentProposal = data.proposal;
  });

  var toggleSelect = function(array, item) {
    var idx = array.indexOf(item);
    if (idx > -1) {
      array.splice(idx, 1);
    } else {
      array.push(item);
    }
  }

  $scope.toggleUserSelect = function(username) {
    toggleSelect($scope.selectedUsernames, username);
  }

  $scope.toggleRoleSelect = function(rolename) {
    toggleSelect($scope.selectedRoles, rolename);
  }

  // Fisher-Yates shuffle, Knuth shuffle
  var shuffle = function(array) {
    var i = array.length;

    while (i > 0) {
      // Swap random element with current element.
      var rand = Math.floor(Math.random() * i);
      i -= 1;
      var tmp = array[i];
      array[i] = array[rand];
      array[rand] = tmp;
    }

    return array;
  }

  $scope.randomRoles = function(advanced) {
    $scope.selectedRoles = [];
    var categories = ['finance', 'communications', 'force'];
    for (var i in categories) {
      var category = allRoles[categories[i]];
      var choices = advanced ? category.basic.concat(category.advanced) : category.basic;
      var item = choices[Math.floor(Math.random() * choices.length)];
      $scope.selectedRoles.push(item);
    }

    // Two from special interests
    var category = allRoles.special_interests;
    var choices = advanced ? category.basic.concat(category.advanced) : category.basic;
    // This will shuffle allRoles.special_interests.basic if advanced == false but that's OK
    // nothing else uses it or depends on its order.
    shuffle(choices);
    $scope.selectedRoles.push(choices[0]);
    $scope.selectedRoles.push(choices[1]);
    return false;
  }

  $scope.userAcceptedProposal = function(proposal) {
    return $scope.myUsername in proposal.accepted_players;
  }

  $scope.watchGame = function(game) {
    $http.post('/game/watch', {game_id: game.id}).success(function(data, status, headers, config) {
      $window.location.href = '/game';
    });
  }

  $scope.proposalValid = function() {
    var usersOk = 1 <= $scope.selectedUsernames.length && $scope.selectedUsernames.length <= 5;
    var rolesOk = $scope.selectedRoles.length == 5;
    return usersOk && rolesOk;
  }

  $scope.submitProposal = function() {
    $http.post('/proposals', {
      users: $scope.selectedUsernames,
      roles: $scope.selectedRoles,
    });
  }

  $scope.acceptProposal = function() {
    $http.post('/proposals/accept');
  }

  $scope.declineProposal = function() {
    $http.post('/proposals/decline');
  }

  var onNewProposal = function(event) {
    $scope.$apply(function() {
      if ($scope.currentProposal !== null) {
        // If current is null but last is non-null,
        // we wouldn't want to replace last.
        $scope.lastProposal = $scope.currentProposal;
      }
      $scope.currentProposal = JSON.parse(event.data);
    });
  }

  var onProposalError = function(event) {
    $scope.$apply(function() {
      $scope.proposalError = event.data;
      $scope.lastProposal = $scope.currentProposal;
      $scope.currentProposal = null;
    });
  }

  var onUpdateProposal = function(event) {
    $scope.$apply(function() {
      $scope.currentProposal = JSON.parse(event.data);
    });
  }

  var onUpdateGames = function(event) {
    $scope.$apply(function() {
      $scope.games = JSON.parse(event.data);
    });
  }

  var onUpdateUsers = function(event) {
    $scope.$apply(function() {
      $scope.users = JSON.parse(event.data);
    });
  }

  var onStartGame = function(event) {
    $window.location.href = '/game';
  }

  var es = new EventSource('/stream');
  es.addEventListener('chat.lobby', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
  es.addEventListener('game.start', onStartGame, false);
  es.addEventListener('games.update', onUpdateGames, false);
  es.addEventListener('proposal.new', onNewProposal, false);
  es.addEventListener('proposal.error', onProposalError, false);
  es.addEventListener('proposal.update', onUpdateProposal, false);
  es.addEventListener('users.update', onUpdateUsers, false);
});
