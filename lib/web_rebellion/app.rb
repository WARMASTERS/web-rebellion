require 'json'
require 'rebellion_g54/game'
require 'securerandom'
require 'sinatra/base'
require 'time'
require 'tilt/haml'
require_relative 'user'

module WebRebellion; class App < Sinatra::Application

  use Rack::Session::Cookie, secret: SecureRandom.hex(64)
  set server: 'thin'
  set root: File.dirname(File.dirname(File.dirname(__FILE__)))

  set users_by_id: {}
  set users_by_username: {}

  set games: {}

  helpers do
    def current_username
      current_user && current_user.name
    end
  end

  def current_user
    settings.users_by_id[session[:user_id]]
  end

  def current_game
    current_user.game
  end

  def current_proposal
    current_user.proposal
  end

  def current_stream
    current_user.event_stream
  end

  before do
    pass if request.path_info.split('/')[1] == 'js'
    pass if request.path_info.split('/') == ['', 'login']

    unless current_user
      session[:user_id] = nil
      halt haml :login, locals: {failed: false, username: ''}
    end
  end

  def json_body
    if request.content_length && request.content_length.to_i > 0
      # cargo culted this rewind
      # sinatra docs say "in case someone already read it"
      request.body.rewind
      JSON.parse(request.body.read)
    end
  end

  def serialize_game(game)
    # For lobby
    {
      id: game.id,
      usernames: game.users.map(&:username),
      start_time: game.start_time.to_i,
    }
  end

  def serialize_games
    settings.games.values.map { |g| serialize_game(g) }
  end

  post '/login' do
    username_down = params[:username].downcase
    existing_user = settings.users_by_username[username_down]
    if existing_user
      halt haml :login, locals: {failed: true, username: params[:username]} unless existing_user.try_password(params[:password])
      session[:user_id] = existing_user.id
    else
      u = User.new(params[:username], params[:password])
      settings.users_by_username[username_down] = u
      settings.users_by_id[u.id] = u
      session[:user_id] = u.id
    end
    redirect '/'
  end

  get '/logout' do
    session[:user_id] = nil
    redirect '/'
  end

  get '/' do
    redirect '/game' if current_game
    redirect '/games'
  end

  get '/games' do
    redirect '/game' if current_game
    haml :lobby
  end

  get '/games.json', provides: 'application/json' do
    JSON.dump({
      username: current_username,
      games: serialize_games,
      users: settings.users_by_id.values.map(&:serialize),
      proposal: current_proposal && current_proposal.serialize,
    })
  end

  post '/proposals' do
    redirect '/game' if current_game
    redirect '/games' if current_proposal

    # Create Proposal
    # Set all players' proposals to be this proposal
    # (skip if they are in a game or proposal)
    # Notify the players.

    204
  end

  post '/proposals/accept' do
    halt 400, "No proposal" unless current_proposal

    # Do nothing if I've already accepted
    # Set myself to accepted
    # If everyone has accepted, start the game
    # Nofify other players

    204
  end

  post '/proposals/decline' do
    halt 400, "No proposal" unless current_proposal

    # Remove myself from proposal
    # Notify all other players
    # If only 1 player is left on proposal, remove that player from it too

    204
  end

  get '/game' do
    if current_game
      haml :game
    else
      redirect '/games'
    end
  end

  post '/chat' do
    g = current_game
    if g
      json = JSON.dump({user: current_username, message: json_body['message']})
      g.each_player { |player|
        player.event_stream << "event: chat\n"
        player.event_stream << "data: #{json}\n\n"
      }
    end
    204
  end

  get '/stream', provides: 'text/event-stream' do
    stream(:keep_open) do |out|
      # One stream per player, please.
      if current_stream
        current_stream << "event: disconnect\n"
        current_stream << "data: #{request.ip}\n\n"
      end
      current_user.event_stream = out
      out.callback { current_user.event_stream = nil if current_stream == out }
    end
    200
  end
end; end
