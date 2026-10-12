extends Area2D
## Fruta coleccionable: flota, se recoge al tocarla y avisa al HUD.


@export var sprite: Texture2D

var _t: float = 0.0
var _base_y: float = 0.0


func _ready() -> void:
	_base_y = position.y
	_t = float(abs(int(position.x)) % 10) * 0.35
	if sprite != null:
		# Las hojas del pack son tiras animadas: se usa el primer frame.
		var at := AtlasTexture.new()
		at.atlas = sprite
		at.region = Rect2(0, 0, 32, 32)
		($Sprite as Sprite2D).texture = at
	body_entered.connect(_on_body_entered)


func _process(delta: float) -> void:
	_t += delta
	position.y = _base_y + sin(_t * 3.0) * 3.0


func _on_body_entered(body: Node2D) -> void:
	if not body.has_method("respawn"):
		return
	var hud := get_tree().get_first_node_in_group("hud")
	if hud != null and hud.has_method("add_fruit"):
		hud.add_fruit()
	queue_free()
