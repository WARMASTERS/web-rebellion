var app = angular.module('webRebellion', []);

app.controller('GameController', function($http, $scope) {
  $scope.messages = [];

  $scope.sendChat = function(message) {
    $http.post('/chat', {message: message});
    $scope.msg = '';
  }

  var receiveChat = function(event) {
    $scope.$apply(function() {
      $scope.messages.push(JSON.parse(event.data));
    });
  }

  var es = new EventSource('/game/stream');
  es.addEventListener('chat', receiveChat, false);
});

app.controller('LobbyController', function($http, $scope) {
});
