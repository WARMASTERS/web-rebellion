class User
  attr_reader :id
  attr_reader :username
  attr_reader :last_seen
  attr_accessor :proposal
  attr_accessor :game
  attr_accessor :event_stream

  class << self
    attr_accessor :users_created
  end

  @users_created = 0

  alias :name :username
  alias :to_s :username

  def initialize(username, password)
    self.class.users_created += 1
    @id = self.class.users_created

    @username = username
    @password = password
    @proposal = nil
    @game = nil
    @event_stream = nil
    @last_seen = Time.now.to_i
    @last_event_sent = 0
  end

  def try_password(password)
    @password == password
  end

  def serialize
    {
      username: @username,
      in_proposal: !!@proposal,
      in_game: !!@game,
    }
  end

  def send_event(type, data)
    return false unless @event_stream
    @event_stream << "event: #{type}\ndata: #{data}\n\n"
    @last_event_sent = Time.now.to_i
    true
  end

  def keep_alive(interval)
    return false unless @event_stream
    return false if Time.now.to_i - @last_event_sent < interval
    @event_stream << "\n"
    @last_event_sent = Time.now.to_i
    true
  end
end
