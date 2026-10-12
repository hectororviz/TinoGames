extends Node2D
## Chancho perseguidor: vuela hacia el jugador (sin atorarse nunca).
## Arranca quieto en la jaula; main lo activa tras la cuenta regresiva.
## Si te toca: pierdes 1 corazón y ambos salen despedidos.


@export var chase_speed: float = 92.0
@export var max_bonus: float = 13.0
@export var catch_dist: float = 18.0

const SHEET: Texture2D = preload("res://art/pig.png")

var active: bool = false
var home: Vector2

@onready var _spr: AnimatedSprite2D = $AnimatedSprite2D


func _ready() -> void:
	add_to_group("chaser")
	home = global_position
	var sf := SpriteFrames.new()
	sf.add_animation("run")
	sf.set_animation_speed("run", 12)
	sf.set_animation_loop("run", true)
	for i in 12:
		var a := AtlasTexture.new()
		a.atlas = SHEET
		a.region = Rect2(i * 36, 0, 36, 30)
		sf.add_frame("run", a)
	_spr.sprite_frames = sf
	_spr.play("run")


func activate() -> void:
	active = true


func reset() -> void:
	active = false
	global_position = home


func shove_back() -> void:
	global_position.x -= 200.0


func _physics_process(delta: float) -> void:
	if not active:
		return
	var player := get_tree().get_first_node_in_group("player") as Node2D
	if player == null:
		return
	var dx := player.global_position.x - global_position.x
	# Goma: si se escapa mucho, acelera (con tope para que sea justo).
	var bonus := clampf((absf(dx) - 250.0) / 100.0, 0.0, max_bonus)
	var sp := chase_speed + bonus
	global_position.x += signf(dx) * sp * delta if dx != 0.0 else 0.0
	var ty: float = player.global_position.y - 8.0
	global_position.y = lerpf(global_position.y, ty, 1.0 - exp(-3.0 * delta))
	_spr.flip_h = dx < 0.0
	if absf(dx) < catch_dist and absf(player.global_position.y - global_position.y) < 24.0:
		if player.has_method("take_damage"):
			player.take_damage(1, global_position)
