require 'rebellion_g54/game'

module WebRebellion; class Game < RebellionG54::Game
  class << self
    attr_accessor :games_created
  end

  @games_created = 0

  def initialize(*args)
    super(*args)
    @watchers = {}
  end

  def watchers
    @watchers.values
  end

  def add_watcher(user)
    @watchers[user.id] = user
  end

  def remove_watcher(user)
    @watchers.delete(user.id)
  end
end; end
