var app = angular.module('webRebellion', []);

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

  $scope.makeChoice = function(label, choice) {
    if (choice.needs_args) {
      $scope.labelToConfirm = label;
      $scope.choiceToConfirm = choice;
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
  }

  $scope.addRoleArg = function(role) {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    $scope.choiceArgs.push({type: "role", value: role});
  }

  $scope.deleteArg = function(idx) {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    $scope.choiceArgs.splice(idx, 1);
  }

  $scope.confirmChoice = function() {
    if (!$scope.choiceToConfirm) {
      return false;
    }
    sendChoice($scope.labelToConfirm, $scope.choiceArgs);
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

  var es = new EventSource('/stream');
  es.addEventListener('chat.game', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
  es.addEventListener('game.message', onGameMessage, false);
  es.addEventListener('game.update', onGameUpdate, false);
});

app.controller('LobbyController', function($controller, $http, $scope, $window) {
  $controller('BaseController', {$scope: $scope});
  $scope.users = [];
  $scope.selectedUsernames = [];
  $scope.selectedRoles = ['banker', 'director', 'guerrilla', 'politician', 'peacekeeper'];
  $scope.currentProposal = null;
  $scope.lastProposal = null;
  $scope.myUsername = null;

  $http.get('/games.json').success(function(data, status, headers, config) {
    $scope.myUsername = data.username;
    $scope.users = data.users;
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

  $scope.userAcceptedProposal = function(proposal) {
    return $scope.myUsername in proposal.accepted_players;
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
  es.addEventListener('proposal.new', onNewProposal, false);
  es.addEventListener('proposal.error', onProposalError, false);
  es.addEventListener('proposal.update', onUpdateProposal, false);
  es.addEventListener('users.update', onUpdateUsers, false);
});
