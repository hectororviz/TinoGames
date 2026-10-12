extends Node2D
## Pantalla de juego: pinta tiles PA sobre la colisión, cámara, foso y R.


const TILESET_TEX: Texture2D = preload("res://art/tiles_pa.png")


func _build_tiles() -> void:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(16, 16)
	var src := TileSetAtlasSource.new()
	src.texture = TILESET_TEX
	src.texture_region_size = Vector2i(16, 16)
	for i in 10:
		src.create_tile(Vector2i(i, 0))
	ts.add_source(src)
	var layer := TileMapLayer.new()
	layer.tile_set = ts
	layer.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	layer.z_index = -5
	add_child(layer)
	var solid := {}
	var rects: Array = []
	for cs in ($Geometry as StaticBody2D).get_children():
		var shape := cs as CollisionShape2D
		var r := shape.shape as RectangleShape2D
		var cells: Array = []
		var c0 := int(floor((shape.position.x - r.size.x * 0.5) / 16.0))
		var c1 := int(ceil((shape.position.x + r.size.x * 0.5) / 16.0)) - 1
		var r0 := int(floor((shape.position.y - r.size.y * 0.5) / 16.0))
		var r1 := int(ceil((shape.position.y + r.size.y * 0.5) / 16.0)) - 1
		for cx in range(c0, c1 + 1):
			for cy in range(r0, r1 + 1):
				solid[Vector2i(cx, cy)] = true
				cells.append(Vector2i(cx, cy))
		rects.append(cells)
	for cells in rects:
		for cell in (cells as Array):
			var idx := 0
			if not bool(solid.get(Vector2i(cell.x, cell.y - 1), false)):
				var l_empty := not bool(solid.get(Vector2i(cell.x - 1, cell.y), false))
				var r_empty := not bool(solid.get(Vector2i(cell.x + 1, cell.y), false))
				if l_empty and not r_empty:
					idx = 2
				elif r_empty and not l_empty:
					idx = 3
				else:
					idx = 8 if (cell.x * 7 + cell.y * 13) % 9 == 0 else 1
			else:
				var h: int = (cell.x * 5 + cell.y * 11) % 11
				idx = [6, 7, 9][h % 3] if h < 3 else 0
			layer.set_cell(cell, 0, Vector2i(idx, 0))


func _ready() -> void:
	_build_tiles()
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
