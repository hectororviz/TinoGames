extends Node2D
## Pantalla de juego: cámara, foso y reinicio con R.


func _ready() -> void:
	var cam := get_tree().get_first_node_in_group("player_camera") as Camera2D
	if cam != null:
		cam.limit_left = -440
		cam.limit_top = -200
		cam.limit_right = 440
		cam.limit_bottom = 120
	($Killzone as Area2D).body_entered.connect(_on_killzone_body)


func _on_killzone_body(body: Node2D) -> void:
	if body.has_method("respawn"):
		body.respawn()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("restart"):
		get_tree().reload_current_scene()
