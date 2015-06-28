module WebRebellion; class Proposal
  attr_reader :initiator

  def initialize(initiator, players, roles)
    @initiator = initiator
    @players = players.map { |p| [p, false] }.to_h
    @roles = roles.freeze
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
      players: @players.keys.map(&:username),
      roles: @roles,
    }
  end
end; end
