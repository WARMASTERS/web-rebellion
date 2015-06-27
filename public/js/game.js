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

app.controller('LobbyController', function($http, $interval, $scope) {
  $scope.games = [];

  var updateGames = function(data, status, headers, config) {
    $scope.games = data;
  }
  var gamesError = function(data, status, headers, config) {
    console.log(response.data);
  }

  var showGames = function() {
    $http.get('/games.json').success(updateGames).error(gamesError);
  }

  showGames();

  var gamesInterval = $interval(showGames, 5000);
  $scope.$on('$destroy', function() {
    $interval.cancel(gamesIntervall);
  })
});
