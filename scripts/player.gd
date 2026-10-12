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

@export_group("Dash")
@export var dash_speed: float = 260.0
@export var dash_time: float = 0.12
@export var dash_cooldown: float = 0.8

const SHEET: Texture2D = preload("res://art/pink.png")
const CELL: int = 32

var facing: int = 1
var start_position: Vector2
var _coyote: float = 0.0
var _buffer: float = 0.0
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
	start_position = global_position
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

	if Input.is_action_just_pressed("jump"):
		_buffer = jump_buffer
	else:
		_buffer -= delta
	if _buffer > 0.0 and (_coyote > 0.0 or is_on_floor()):
		velocity.y = jump_velocity
		_buffer = 0.0
		_coyote = 0.0
		_dash_t = 0.0

	move_and_slide()
	_update_anim()


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
