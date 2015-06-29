require 'json'
require 'rebellion_g54/game'
require 'rebellion_g54/role'
require 'securerandom'
require 'sinatra/base'
require 'time'
require 'tilt/haml'
require_relative 'game'
require_relative 'game_outputter'
require_relative 'proposal'
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

    def all_roles
      RebellionG54::Role::ALL
    end
  end

  def lobby_users
    settings.users_by_id.values.reject(&:game)
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

  def user_from_param(param)
    settings.users_by_username[param.downcase]
  end

  before do
    pass if request.path_info.split('/')[1] == 'js'
    pass if request.path_info.split('/') == ['', 'login']
    pass if request.path_info.split('/') == ['', 'register']

    unless current_user
      session[:user_id] = nil
      halt haml :login, locals: {err: nil, username: ''}
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

  def watch_game(game, user)
    old_game = user.game
    user.game = game
    game.add_watcher(user)
    update_lobby_users unless old_game
  end

  def send_event(users, type, data)
    users.each { |u|
      stream = u.event_stream
      next unless stream
      stream << "event: #{type}\n"
      stream << "data: #{data}\n\n"
    }
  end

  def update_lobby_users
    payload = JSON.dump(settings.users_by_id.values.map(&:serialize))
    send_event(lobby_users, 'users.update', payload)
  end

  def update_lobby_games
    payload = JSON.dump(serialize_games)
    send_event(lobby_users, 'games.update', payload)
  end

  def full_game_public_info(game, show_secrets: false)
    role_tokens = game.role_tokens
    roles = game.roles.map { |r| [r, {
      tokens: role_tokens[r] || [],
    }]}.to_h
    player_tokens = game.player_tokens
    # This must be an array, since ordering is important.
    player_info = game.each_player.map { |p|
      player_info(p, player_tokens, show_secrets: show_secrets).merge(alive: true)
    }
    player_info.concat(game.each_dead_player.map { |p|
      player_info(p, player_tokens, show_secrets: show_secrets).merge(alive: false)
    })

    choice_names = game.choice_names

    {
      start_time: game.start_time.to_i,
      id: game.id,
      turn: game.turn_number,
      roles: roles,
      players: player_info,
      winner: game.winner && game.winner.username,
      decision: game.decision_description,
      decision_makers: choice_names.keys.map(&:username),
      decision_choices: choice_names.values.flatten.uniq,
    }
  end

  def player_info(player, player_tokens, show_secrets: false)
    {
      username: player.user.username,
      coins: player.coins,
      tokens: player_tokens[player.user] || [],
      cards: card_info(player, show_secrets: show_secrets),
    }
  end

  def full_game_private_info(game, player)
    {
      my_username: player.user.username,
      my_cards: card_info(player, show_secrets: true),
      my_choices: game.choice_explanations(player.user),
    }
  end

  def card_info(player, show_secrets: false)
    cards = []
    cards.concat(player.each_live_card.map { |card| { role: show_secrets ? card.role : nil }})
    cards.concat(player.each_side_card.map { |card, claimed_role| {
      role: show_secrets ? card.role : nil,
      claimed_role: claimed_role,
    }})
    cards.concat(player.each_revealed_card.map { |card| { role: card.role }})
    cards
  end

  post '/register' do
    username_down = params[:username].downcase
    existing_user = settings.users_by_username[username_down]
    if existing_user
      haml :login, locals: {err: 'Username is taken', username: params[:username]}
    elsif params[:username].gsub(/[[:space:]]/, '').empty?
      haml :login, locals: {err: 'Username cannot be blank', username: ''}
    elsif params[:username].size > 32
      haml :login, locals: {err: 'Username cannot be logner than 32 characters', username: ''}
    elsif params[:password] != params[:confirm_password]
      haml :login, locals: {err: 'Password and confirmation did not match', username: params[:username]}
    else
      u = User.new(params[:username], params[:password])
      settings.users_by_username[username_down] = u
      settings.users_by_id[u.id] = u
      session[:user_id] = u.id
      update_lobby_users
      redirect '/'
    end
  end

  post '/login' do
    username_down = params[:username].downcase
    existing_user = settings.users_by_username[username_down]
    if existing_user && existing_user.try_password(params[:password])
      session[:user_id] = existing_user.id
      update_lobby_users
      redirect '/'
    elsif existing_user
      haml :login, locals: {err: 'Incorrect password', username: params[:username]}
    else
      haml :login, locals: {err: 'No such user', username: params[:username]}
    end
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

    body = json_body

    users = body['users'].map { |u| user_from_param(u) }.compact
    # You can't be proposed to if you're in a game or proposal
    eligible_users = users.reject { |u| u.proposal || u.game }
    eligible_users << current_user
    eligible_users.uniq!

    # In ruby 2.2 since symbols are garbage-collected,
    # it should be OK to to_sym strings from user input.
    roles = body['roles'].map(&:to_sym).select { |r| all_roles.has_key?(r) }

    size_ok = (RebellionG54::Game::MIN_PLAYERS..RebellionG54::Game::MAX_PLAYERS).include?(eligible_users.size)

    if size_ok && roles.size == RebellionG54::Game::ROLES_PER_GAME
      proposal = Proposal.new(current_user, eligible_users, roles)
      eligible_users.each { |eu| eu.proposal = proposal }
      send_event(eligible_users, 'proposal.new', JSON.dump(proposal.serialize))
      update_lobby_users
    end

    204
  end

  post '/proposals/accept' do
    halt 400, "No proposal" unless current_proposal

    # Do nothing if I've already accepted
    success = current_proposal.accept(current_user)
    halt 204 unless success

    proposal = current_proposal
    if current_proposal.everyone_accepted?
      game = Game.new(proposal.initiator.username)
      outputter = GameOutputter.new(self, game)
      game.output_streams << outputter
      game.roles = proposal.roles
      proposal.players.each { |p|
        p.proposal = nil
        p.game = game
        game.add_player(p)
      }
      success, error = game.start_game
      settings.games[game.id] = game
      if success
        send_event(proposal.players, 'game.start', JSON.dump(proposal.serialize))
        update_lobby_users
        update_lobby_games
      else
        send_event([proposal.players], 'proposal.error', error)
        proposal.players.each { |p| p.game = nil }
      end
    else
      send_event(proposal.players, 'proposal.update', JSON.dump(proposal.serialize))
    end

    204
  end

  post '/proposals/decline' do
    halt 400, "No proposal" unless current_proposal

    # Save this because after declining I don't have a current_proposal anymore
    proposal = current_proposal

    proposal.decline(current_user)
    current_user.proposal = nil

    # Notify all players, including myself, so we see the decline
    send_event(proposal.players + [current_user], 'proposal.update', JSON.dump(proposal.serialize))

    # Send UI update removing the proposal from myself so I don't see buttons anymore
    send_event([current_user], 'proposal.new', 'null')

    # If too few players are left on proposal, remove remaining players too
    if proposal.players.size < RebellionG54::Game::MIN_PLAYERS
      send_event(proposal.players, 'proposal.new', 'null')
      proposal.players.each { |p| p.proposal = nil }
    end

    update_lobby_users

    204
  end

  get '/game' do
    if current_game
      haml :game
    else
      redirect '/games'
    end
  end

  post '/game/choice' do
    user = current_user
    game = user && user.game
    halt 400, 'No game' unless user && game

    body = json_body
    choice = body['choice']
    args = body['args'].map { |arg|
      case arg['type']
      when 'player'
        u = user_from_param(arg['value'])
        halt 400, "No such user" unless u
        u
      when 'role'; arg['value']
      else; halt 400, "No type #{arg['type']}"
      end
    }

    success, error = game.take_choice(current_user, choice, *args)
    halt 400, error unless success

    # Action succeeded. Send all players a full update.
    # TODO: Consider incremental updates once we have support.
    # That's pretty low priority since the full update is not that long.
    public_info = full_game_public_info(game, show_secrets: !!game.winner).merge(time: Time.now.to_i)
    game.each_player.each { |player|
      stream = player.user.event_stream
      next unless stream
      private_info = full_game_private_info(game, player)
      stream << "event: game.update\n"
      stream << "data: #{JSON.dump(public_info.merge(private_info))}\n\n"
    }

    if game.winner
      settings.games.delete(game.id)
      update_lobby_games
    end

    send_event(game.watchers, 'game.update', JSON.dump(public_info))

    204
  end

  post '/game/watch' do
    halt 400, 'finish your game first' if current_game
    game = settings.games[json_body['game_id']]
    halt 404, 'no such game' unless game

    watch_game(game, current_user)
    204
  end

  post '/game/leave' do
    game = current_game
    halt 400, 'no game' unless game

    in_game = game.find_player(current_user)
    halt 400, 'cannot leave game in progress' if in_game && !game.winner

    current_user.game = nil
    game.remove_watcher(current_user)
    update_lobby_users

    redirect '/games'
  end

  get '/game.json', provides: 'application/json' do
    game = current_game
    halt '{}' unless game
    public_info = full_game_public_info(game)
    player = game.find_player(current_user)

    # A watcher may ask for game.json. The watcher should get public info only.
    return JSON.dump(public_info) unless player

    private_info = full_game_private_info(game, player)
    JSON.dump(public_info.merge(private_info))
  end

  post '/chat' do
    g = current_game
    target_players = g ? (g.users | g.watchers): lobby_users

    halt 400, 'game in progress, do not disturb' if g && !g.find_player(current_user) && !g.winner

    json = JSON.dump({user: current_username, message: json_body['message'], time: Time.now.to_i})
    send_event(target_players, 'chat.' + (g ? 'game' : 'lobby'), json)
    204
  end

  get '/stream', provides: 'text/event-stream' do
    stream(:keep_open) do |out|
      # One stream per player, please.
      send_event([current_user], 'disconnect', request.ip)
      current_user.event_stream = out
      out.callback { current_user.event_stream = nil if current_stream == out }
    end
    200
  end
end; end
