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

  # keyed by game id
  set game_connections: Hash.new { |h, k| h[k] = [] }

  set users_by_id: {}
  set users_by_username: {}

  # keyed by id
  set games: {}

  # keyed by game id
  set game_passwords: {}

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

  before do
    pass if request.path_info.split('/')[1] == 'js'
    pass if request.path_info.split('/') == ['', 'login']

    halt haml :login, locals: {failed: false, username: ''} unless current_user
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
      name: game.channel_name,
      size: game.size,
      in_progress: game.started?,
      has_password: !settings.game_passwords[game.id].empty?
    }
  end

  def serialize_games
    settings.games.values.map { |g| serialize_game(g) }
  end

  def join_game(game)
    success = game.add_player(current_username)
    return false unless success
    current_user.game = game
    true
  end

  def leave_game(game)
    success = game.remove_player(current_username)
    return false unless success
    current_user.game = nil
    settings.games.delete(game.id) if game.size == 0
    true
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
    failed = params[:failed_join]
    haml :lobby, locals: {failed: failed}
  end

  get '/games.json', provides: 'application/json' do
    JSON.dump(serialize_games)
  end

  post '/games' do
    unless current_game
      game = RebellionG54::Game.new(current_username)
      settings.games[game.id] = game
      settings.game_passwords[game.id] = params[:password].to_s
      join_game(game)
    end
    redirect '/game'
  end

  post '/games/join' do
    if current_game
      redirect '/game'
    else
      game = settings.games[params[:game_id].to_i]
      if game && params[:password].to_s == settings.game_passwords[game.id]
        join_game(game)
        redirect '/game'
      else
        redirect '/games?failed_join=true'
      end
    end
  end

  post '/games/leave' do
    game = current_game
    if game && game.started?
      # Can't leave game in progress
      redirect '/game'
    else
      leave_game(game) if game
      redirect '/games'
    end
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
      settings.game_connections[g.id].each { |out|
        out << "event: chat\n"
        out << "data: #{json}\n\n"
      }
    end
    204
  end

  get '/game/stream', provides: 'text/event-stream' do
    g = current_game
    if g
      stream(:keep_open) do |out|
        settings.game_connections[g.id] << out
        out.callback { settings.game_connections[g.id].delete(out) }
      end
    end
    200
  end
end; end
