require 'time'

module WebRebellion; class Proposal
  attr_reader :initiator

  def initialize(initiator, players, roles)
    @initiator = initiator
    @original_players = players.map(&:username)
    @players = players.map { |p| [p, false] }.to_h
    @declined_players = {}
    @roles = roles.freeze
    @time = Time.now.to_i
  end

  def assert_in_game(player)
    raise "#{player} not in game" unless @players.has_key?(player)
  end

  def accept(player)
    assert_in_game(player)
    @players[player] = true
  end

  def decline(player)
    assert_in_game(player)
    @declined_players[player.username] = Time.now.to_i
    @players.delete(player)
    # Reset everyone else's acceptances
    @players.each_key { |k| @players[k] = false }
  end

  def everyone_accepted?
    @players.values.all?
  end

  def serialize
    {
      initiator: @initiator.username,
      original_players: @original_players,
      players: @players.keys.map(&:username),
      declined_players: @declined_players,
      roles: @roles,
      time: @time,
    }
  end
end; end
