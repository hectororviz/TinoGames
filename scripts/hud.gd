extends CanvasLayer
## HUD mínimo: contador de frutas + mensajes.


var fruits: int = 0
var total: int = 6


func _ready() -> void:
	add_to_group("hud")
	(%FruitLabel as Label).text = _counter()
	(%MsgLabel as Label).hide()
	(%MsgTimer as Timer).timeout.connect((_msg() as Label).hide)


func _msg() -> Label:
	return %MsgLabel as Label


func _counter() -> String:
	return "Frutas: %d/%d" % [fruits, total]


func add_fruit() -> void:
	fruits += 1
	(%FruitLabel as Label).text = _counter()
	if fruits >= total:
		show_msg("¡Todas las frutas!")


func show_msg(text: String) -> void:
	_msg().text = text
	_msg().show()
	(%MsgTimer as Timer).start()
