import mysql from 'mysql'
const pool = mysql.createPool({
	connectionLimit : 10,
	host     : 'localhost',
	user     : 'root',
	password : 'fish',
	database : 'parabible_test'
})

export default {
	query: query => new Promise((resolve, reject) => {
		pool.query(query, (error, results, fields) => {
			resolve({error, results, fields})
		})
	}),
	escape: mysql.escape
}