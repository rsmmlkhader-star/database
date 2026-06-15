exports.up = function(knex) {
  return knex.schema.createTable('conflicts', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sync_id').notNullable().references('id').inTable('sync_history').onDelete('CASCADE');
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.string('table_name', 255).notNullable();
    table.string('row_id', 255).notNullable();
    table.jsonb('db_value');
    table.jsonb('sheet_value');
    table.jsonb('resolved_value');
    table.enum('resolution_strategy', ['LWW', 'SHEET_WINS', 'DB_WINS', 'MANUAL', 'MERGE']).defaultTo('LWW');
    table.enum('resolution_status', ['PENDING', 'RESOLVED', 'IGNORED']).defaultTo('PENDING');
    table.text('resolution_notes');
    table.timestamp('resolved_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index('sync_id');
    table.index('connection_id');
    table.index('resolution_status');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('conflicts');
};
