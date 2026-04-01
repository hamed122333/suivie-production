BEGIN;

TRUNCATE TABLE tasks, workspaces, users RESTART IDENTITY CASCADE;

-- Insert users
-- password for all: admin123
INSERT INTO users (name, email, password, role) VALUES 
('Responsable Suivi', 'admin@example.com', '$2a$10$r3/0MgjCM9iC3CSLpmIwNeI6FxCxGAMobCuXetKbOjnuEwMFBCl5S', 'super_admin'),
('Planificateur 1', 'planner@example.com', '$2a$10$r3/0MgjCM9iC3CSLpmIwNeI6FxCxGAMobCuXetKbOjnuEwMFBCl5S', 'planner'),
('Commercial 1', 'commercial@example.com', '$2a$10$r3/0MgjCM9iC3CSLpmIwNeI6FxCxGAMobCuXetKbOjnuEwMFBCl5S', 'commercial'),
('Utilisateur', 'user@example.com', '$2a$10$r3/0MgjCM9iC3CSLpmIwNeI6FxCxGAMobCuXetKbOjnuEwMFBCl5S', 'user');

-- Insert workspaces
INSERT INTO workspaces (name) VALUES 
('Production Ligne A'),
('Production Ligne B');

-- Insert tasks
INSERT INTO tasks (
  title,
  description,
  status,
  priority,
  client_name,
  order_code,
  item_reference,
  quantity,
  quantity_unit,
  due_date,
  planned_date,
  production_line,
  machine,
  workshop,
  notes,
  expected_action,
  workspace_id,
  created_by,
  blocked_reason,
  blocked_at,
  completed_at,
  board_position
) VALUES
('Commande CI2682', 'Assemblage des kits série CI2682 pour la tournée client.', 'TODO', 'HIGH', 'Plasticum', 'CMD-1021', 'CI2682', 1200, 'pcs', CURRENT_DATE + 2, NULL, 'Ligne A', 'Presse 3', 'Injection', 'Prévoir contrôle matière avant lancement.', NULL, 1, 3, NULL, NULL, NULL, 0),
('Semaine 14 - Lot DV0275', 'Ordonnancer le lot DV0275 et réserver la machine principale.', 'IN_PROGRESS', 'MEDIUM', 'EJM', 'CMD-1028', 'DV0275', 640, 'pcs', CURRENT_DATE + 4, NULL, 'Ligne A', NULL, 'Planification', 'Attente du feu vert planning.', 'Fixer le créneau de production', 1, 2, NULL, NULL, NULL, 0),
('Lot qualité SO380580', 'Contrôle final avant expédition du lot client.', 'IN_PROGRESS', 'URGENT', 'Gargouri', 'CMD-1030', 'SO380580', 480, 'pcs', CURRENT_DATE + 1, CURRENT_DATE - 1, 'Ligne B', 'Presse 5', 'Qualité', 'Vérifier les points de soudure.', NULL, 1, 2, NULL, NULL, NULL, 0),
('Commande urgente PLN-44', 'Conditionnement en attente d''étiquettes transport.', 'BLOCKED', 'URGENT', 'Novapack', 'CMD-1031', 'PLN-44', 300, 'cartons', CURRENT_DATE, CURRENT_DATE - 1, 'Ligne B', 'Cellule 2', 'Conditionnement', 'Transport prévu demain matin.', 'Relancer le fournisseur d''étiquettes', 2, 2, 'Retard fournisseur d''étiquettes', CURRENT_TIMESTAMP - INTERVAL '4 hours', NULL, 0),
('Expédition Lot 1019', 'Commande terminée et prête à être archivée.', 'DONE', 'LOW', 'Plasticum', 'CMD-1019', 'CI0157', 850, 'pcs', CURRENT_DATE - 1, CURRENT_DATE - 3, 'Ligne A', 'Presse 1', 'Expédition', 'Livraison validée.', NULL, 2, 3, NULL, NULL, CURRENT_TIMESTAMP - INTERVAL '2 hours', 0);

COMMIT;
