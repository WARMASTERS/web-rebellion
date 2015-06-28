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
  var es = new EventSource('/stream');
  es.addEventListener('chat', $scope.receiveChat, false);
  es.addEventListener('disconnect', $scope.disconnected, false);
});
