-- ============================================
-- ACTUALIZACIÓN DE POLÍTICAS RLS PARA TABLA AGENTS
-- Permite gestión completa de agentes manteniendo seguridad
-- ============================================

-- 1. Eliminar todas las políticas existentes de la tabla agents
DROP POLICY IF EXISTS "Users can view their own agents" ON agents;
DROP POLICY IF EXISTS "Users can create their own agents" ON agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON agents;
DROP POLICY IF EXISTS "Users can view own agents" ON agents;
DROP POLICY IF EXISTS "Users can create agents" ON agents;
DROP POLICY IF EXISTS "Users can update own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete own agents" ON agents;
DROP POLICY IF EXISTS "Enable read access for all users" ON agents;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON agents;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON agents;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON agents;
DROP POLICY IF EXISTS "Service role has full access" ON agents;

-- 2. Crear política para service role (backend con service key)
CREATE POLICY "Service role has full access" ON agents
    FOR ALL
    USING (auth.role() = 'service_role');

-- 3. Política SELECT - Los usuarios pueden ver sus propios agentes
CREATE POLICY "Users can view own agents" ON agents
    FOR SELECT
    USING (
        auth.uid()::text = user_id::text 
        OR 
        auth.jwt() ->> 'role' = 'service_role'
    );

-- 4. Política INSERT - Los usuarios pueden crear sus propios agentes
CREATE POLICY "Users can create own agents" ON agents
    FOR INSERT
    WITH CHECK (
        auth.uid()::text = user_id::text 
        OR 
        auth.jwt() ->> 'role' = 'service_role'
        OR
        auth.uid() IS NULL -- Para testing/setup inicial
    );

-- 5. Política UPDATE - Los usuarios pueden actualizar sus propios agentes
CREATE POLICY "Users can update own agents" ON agents
    FOR UPDATE
    USING (
        auth.uid()::text = user_id::text 
        OR 
        auth.jwt() ->> 'role' = 'service_role'
    )
    WITH CHECK (
        auth.uid()::text = user_id::text 
        OR 
        auth.jwt() ->> 'role' = 'service_role'
    );

-- 6. Política DELETE - Los usuarios pueden eliminar sus propios agentes
CREATE POLICY "Users can delete own agents" ON agents
    FOR DELETE
    USING (
        auth.uid()::text = user_id::text 
        OR 
        auth.jwt() ->> 'role' = 'service_role'
    );

-- 7. Verificación de las políticas creadas
SELECT 
    'Política creada:' as status,
    policyname,
    cmd as comando,
    permissive as permisiva
FROM pg_policies 
WHERE tablename = 'agents'
ORDER BY policyname;