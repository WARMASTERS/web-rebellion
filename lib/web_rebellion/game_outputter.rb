require 'time'

module WebRebellion; class GameOutputter
  def initialize(app, game)
    @app = app
    @game = game
  end

  def player_died(user)
    # TODO: update lobby games to show that the user is no longer in the game?
    # Maybe. But I'm not sure it's worth the bandwidth =D
    @app.watch_game(@game, user)
  end

  def new_cards(_)
    # Do nothing.
    # We may have to change this if we ever do incremental updates.
  end

  def puts(msg)
    payload = JSON.dump({time: Time.now.to_i, message: msg})
    @app.send_event(@game.users | @game.watchers, 'game.message', payload)
  end
end; end
