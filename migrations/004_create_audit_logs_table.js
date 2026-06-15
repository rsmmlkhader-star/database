exports.up = function(knex) {
  return knex.schema.createTable('audit_logs', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('user_name', 255);
    table.string('user_email', 255);
    table.uuid('sync_id').references('id').inTable('sync_history').onDelete('SET NULL');
    table.string('table_name', 255).notNullable();
    table.string('row_id', 255).notNullable();
    table.enum('operation', ['INSERT', 'UPDATE', 'DELETE']).notNullable();
    table.enum('source', ['SHEET', 'DB']).notNullable();
    table.jsonb('before_values');
    table.jsonb('after_values');
    table.jsonb('changed_fields'); // array of field names
    table.boolean('conflict_resolved').defaultTo(false);
    table.string('conflict_strategy', 50);
    table.enum('sync_status', ['SUCCESS', 'FAILURE', 'ROLLBACK']).defaultTo('SUCCESS');
    table.text('error_message');
    table.integer('duration_ms').defaultTo(0);
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.index('connection_id');
    table.index('user_id');
    table.index('sync_id');
    table.index('table_name');
    table.index('row_id');
    table.index('timestamp');
    table.index(['connection_id', 'timestamp']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('audit_logs');
};
