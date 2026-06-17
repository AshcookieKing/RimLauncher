-- Очистка очереди спавна зон для тестирования
-- Запустить через MySQL клиент или phpMyAdmin

USE arma3_slserver;

-- Показать текущие записи
SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, state, error_message
FROM arma_map_zone_spawn_queue
WHERE server_id = 1
ORDER BY id DESC
LIMIT 10;

-- Удалить все записи (раскомментируйте если нужно)
-- DELETE FROM arma_map_zone_spawn_queue WHERE server_id = 1;

-- Или пометить как обработанные
-- UPDATE arma_map_zone_spawn_queue SET state = 'done' WHERE server_id = 1 AND state = 'pending';
