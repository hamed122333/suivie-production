BEGIN;

TRUNCATE TABLE tasks, workspaces, users RESTART IDENTITY CASCADE;

-- Insert users
-- password for all: admin123 
INSERT INTO users (name, email, password, role) VALUES 
('Super Admin', 'admin@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'super_admin'),
('Planificateur 1', 'planner@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'planner'),
('Commercial 1', 'commercial@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'commercial'),
('Utilisateur', 'user@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user');

-- Insert workspaces
INSERT INTO workspaces (name) VALUES 
('Production Ligne A'),
('Production Ligne B');

-- Insert tasks
INSERT INTO tasks (title, description, status, priority, workspace_id, created_by, board_position) VALUES 
('Préparer la commande 1021', 'Assemblage des pièces A et B pour la série', 'TODO', 'HIGH', 1, 3, 0),
('Valider le prototype X', 'Test de qualité sur le premier lot', 'IN_PROGRESS', 'URGENT', 1, 1, 0),
('Expédition Lot 1019', 'Contacter le transporteur', 'DONE', 'MEDIUM', 1, 3, 0),

('Réparer la machine 4', 'Le capteur de température est défectueux', 'BLOCKED', 'URGENT', 2, 2, 0),
('Planifier la semaine prochaine', 'Répartition des équipes selon la production', 'TODO', 'LOW', 2, 3, 0);

COMMIT;
