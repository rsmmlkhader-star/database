exports.up = function(knex) {
  return knex.schema.createTable('sync_history', table => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('connection_id').notNullable().references('id').inTable('connections').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('table_name', 255).notNullable();
    table.string('sheet_id', 255);
    table.enum('status', ['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'PARTIAL']).defaultTo('PENDING');
    table.integer('total_changes').defaultTo(0);
    table.integer('successful_changes').defaultTo(0);
    table.integer('failed_changes').defaultTo(0);
    table.integer('conflicts_detected').defaultTo(0);
    table.integer('duration_ms').defaultTo(0);
    table.text('error_message');
    table.jsonb('summary'); // {inserts, updates, deletes, conflicts}
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('completed_at');
    table.index('connection_id');
    table.index('user_id');
    table.index('status');
    table.index('started_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('sync_history');
};
