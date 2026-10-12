extends Control
## Menú principal: portada con el héroe, JUGAR y SALIR.
## Cuando el personaje tenga nombre y rasgos, van acá (Hero + HeroName).


var _t: float = 0.0
@onready var _hero: Sprite2D = $Hero
@onready var _base_y: float = $Hero.position.y


func _ready() -> void:
	(%PlayBtn as Button).grab_focus()
	(%PlayBtn as Button).pressed.connect(_on_play)
	(%QuitBtn as Button).pressed.connect(_on_quit)
	var sheet := load("res://art/pink.png") as Texture2D
	var atlas := AtlasTexture.new()
	atlas.atlas = sheet
	atlas.region = Rect2(0, 0, 32, 32)
	_hero.texture = atlas


func _process(delta: float) -> void:
	_t += delta
	_hero.position.y = _base_y + sin(_t * 2.5) * 4.0


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		_on_play()


func _on_play() -> void:
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func _on_quit() -> void:
	get_tree().quit()
