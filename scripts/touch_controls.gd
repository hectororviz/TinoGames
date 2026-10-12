extends CanvasLayer
## Botones táctiles: puentean la pantalla hacia el Input Map.
## Funcionan con dedo y con ratón (emulate_touch_from_mouse=true).


func _ready() -> void:
	_bind_button("MoveLeft", &"move_left")
	_bind_button("MoveRight", &"move_right")
	_bind_button("Jump", &"jump")
	_bind_button("Dash", &"dash")


func _bind_button(node_name: StringName, action: StringName) -> void:
	var btn := get_node_or_null(NodePath(node_name)) as BaseButton
	if btn == null:
		push_warning("Falta botón táctil: " + node_name)
		return
	if not InputMap.has_action(action):
		push_warning("Falta acción de input: " + action)
		return
	btn.button_down.connect(Input.action_press.bind(action))
	btn.button_up.connect(Input.action_release.bind(action))
