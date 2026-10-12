extends CharacterBody2D
## Héroe del jueguito: correr, saltar (coyote + buffer) y dash.
## Controles vía Input Map (teclado, táctil y gamepad entran por el mismo lado).


@export_group("Movimiento")
@export var speed: float = 110.0
@export var acceleration: float = 900.0
@export var friction: float = 1100.0

@export_group("Salto")
@export var jump_velocity: float = -280.0
@export var gravity: float = 700.0
@export var coyote_time: float = 0.10
@export var jump_buffer: float = 0.12
@export var double_jump: bool = true

@export_group("Dash")
@export var dash_speed: float = 260.0
@export var dash_time: float = 0.12
@export var dash_cooldown: float = 0.8

@export_group("Vida")
@export var max_hp: int = 3
@export var invuln_time: float = 1.0

const SHEET: Texture2D = preload("res://art/pink.png")
const CELL: int = 32

var facing: int = 1
var start_position: Vector2
var hp: int
var _coyote: float = 0.0
var _buffer: float = 0.0
var _dj_used: bool = false
var _invuln: float = 0.0
var _blink: float = 0.0
var _dash_t: float = 0.0
var _dash_cd: float = 0.0

@onready var _spr: AnimatedSprite2D = $AnimatedSprite2D


func _add_anim(sf: SpriteFrames, anim: StringName, idxs: Array, fps: int) -> void:
	sf.add_animation(anim)
	sf.set_animation_speed(anim, fps)
	sf.set_animation_loop(anim, true)
	for i in idxs:
		var a := AtlasTexture.new()
		a.atlas = SHEET
		a.region = Rect2(int(i) * CELL, 0, CELL, CELL)
		sf.add_frame(anim, a)


func _ready() -> void:
	add_to_group("player")
	start_position = global_position
	hp = max_hp
	var sf := SpriteFrames.new()
	_add_anim(sf, "idle", [0], 1)
	_add_anim(sf, "run", [1, 2], 8)
	_add_anim(sf, "jump", [3], 1)
	_add_anim(sf, "fall", [4], 1)
	_spr.sprite_frames = sf
	_spr.play("idle")


func _physics_process(delta: float) -> void:
	_dash_cd = maxf(0.0, _dash_cd - delta)
	var direction: float = Input.get_axis("move_left", "move_right")
	if direction != 0.0:
		facing = int(signf(direction))

	if Input.is_action_just_pressed("dash") and _dash_cd <= 0.0 and _dash_t <= 0.0:
		_dash_t = dash_time
		_dash_cd = dash_cooldown

	if _dash_t > 0.0:
		_dash_t -= delta
		velocity = Vector2(float(facing) * dash_speed, 0.0)
	else:
		if direction != 0.0:
			velocity.x = move_toward(velocity.x, direction * speed, acceleration * delta)
		else:
			velocity.x = move_toward(velocity.x, 0.0, friction * delta)
		if not is_on_floor():
			velocity.y += gravity * delta
			_coyote -= delta
		else:
			_coyote = coyote_time
			_dj_used = false

	if Input.is_action_just_pressed("jump"):
		_buffer = jump_buffer
	else:
		_buffer -= delta
	if _buffer > 0.0 and (_coyote > 0.0 or is_on_floor()):
		velocity.y = jump_velocity
		_buffer = 0.0
		_coyote = 0.0
		_dash_t = 0.0
	elif _buffer > 0.0 and double_jump and not _dj_used and not is_on_floor():
		velocity.y = jump_velocity * 0.9
		_buffer = 0.0
		_dj_used = true
		_dash_t = 0.0

	move_and_slide()
	_update_anim()


func _process(delta: float) -> void:
	if _invuln > 0.0:
		_invuln -= delta
		_blink += delta
		modulate.a = 0.35 + 0.3 * sin(_blink * 30.0)
		if _invuln <= 0.0:
			modulate.a = 1.0


func take_damage(amount: int, from_pos: Vector2) -> void:
	if _invuln > 0.0:
		return
	hp -= amount
	var hud := get_tree().get_first_node_in_group("hud")
	if hud != null and hud.has_method("set_hearts"):
		hud.call("set_hearts", hp)
	if hud != null and hud.has_method("show_msg"):
		hud.call("show_msg", "¡Te agarró!")
	if hp <= 0:
		var main := get_tree().get_first_node_in_group("main")
		if main != null and main.has_method("restart_round"):
			main.call("restart_round")
		return
	var away := signf(global_position.x - from_pos.x)
	if away == 0.0:
		away = 1.0
	velocity = Vector2(away * 160.0, -180.0)
	_invuln = invuln_time
	var chaser := get_tree().get_first_node_in_group("chaser")
	if chaser != null and chaser.has_method("shove_back"):
		chaser.call("shove_back")


func full_heal() -> void:
	hp = max_hp
	_invuln = 0.0
	modulate.a = 1.0
	var hud := get_tree().get_first_node_in_group("hud")
	if hud != null and hud.has_method("set_hearts"):
		hud.call("set_hearts", hp)


func _update_anim() -> void:
	_spr.flip_h = facing < 0
	if not is_on_floor():
		_spr.position.y = -16.0
		_spr.play("jump" if velocity.y < 0.0 else "fall")
	elif absf(velocity.x) > 10.0:
		# Los frames de correr vienen 4px más altos: se compensa acá.
		_spr.position.y = -12.0
		_spr.play("run")
	else:
		_spr.position.y = -16.0
		_spr.play("idle")


func respawn() -> void:
	global_position = start_position
	velocity = Vector2.ZERO
	_coyote = 0.0
	_buffer = 0.0
	_dash_t = 0.0
