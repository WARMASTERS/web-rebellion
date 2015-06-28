require 'time'

module WebRebellion; class GameOutputter
  def initialize(app, game)
    @app = app
    @game = game
  end

  def player_died(_)
    # Do nothing.
    # We may have to change this if we ever do incremental updates.
  end

  def new_cards(_)
    # Do nothing.
    # We may have to change this if we ever do incremental updates.
  end

  def puts(msg)
    payload = JSON.dump({time: Time.now.to_i, message: msg})
    @app.send_event(@game.users, 'game.message', payload)
  end
end; end
