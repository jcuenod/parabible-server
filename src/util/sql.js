const { Pool } = require('pg')

const pool = new Pool({
	user: 'postgres',
	host: '127.0.0.1',
	database: 'parabible',
	password: 'toor',
	port: 5432,
})

const db = {
	query: query => new Promise((resolve, reject) => {
		pool.query(query, (error, results) => {
			if (error) {
				reject(error)
			}
			else {
				resolve(results)
			}
		})
	}),
	destroy: () => {
		const error = pool.destroy()
		if (error) throw error
	}
}
Object.freeze(db)

module.exports = db