var app = angular.module('webRebellion', []);

app.controller('BaseController', function($http, $scope) {
  $scope.messages = [];
  $scope.disconnectedBy = null;

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

app.controller('LobbyController', function($controller, $http, $scope) {
  $controller('BaseController', {$scope: $scope});
  $scope.users = [];
  $scope.selectedUsernames = [];

  $http.get('/games.json').success(function(data, status, headers, config) {
    $scope.users = data.users;
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

  $scope.submitProposal = function() {
    $http.post('/proposals', {
      users: $scope.selectedUsernames,
      // TODO: roles
    });
  }

  var onNewProposal = function(event) {
    console.log(event.data);
  }

  var es = new EventSource('/stream');
  es.addEventListener('chat', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
  es.addEventListener('proposal.new', onNewProposal, false);
});
