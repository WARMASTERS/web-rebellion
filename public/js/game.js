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

app.controller('GameController', function($controller, $http, $scope) {
  $controller('BaseController', {$scope: $scope});
  var es = new EventSource('/stream');
  es.addEventListener('chat', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
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

  var onStartGame = function(event) {
    $window.location.href = '/game';
  }

  var es = new EventSource('/stream');
  es.addEventListener('chat', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
  es.addEventListener('game.start', onStartGame, false);
  es.addEventListener('proposal.new', onNewProposal, false);
  es.addEventListener('proposal.error', onProposalError, false);
  es.addEventListener('proposal.update', onUpdateProposal, false);
});
