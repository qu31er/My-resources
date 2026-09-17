import os
import sqlite3
import mimetypes
from datetime import datetime
from flask import Flask, request, jsonify, send_file, send_from_directory, abort, Response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Railway Volume монтируется в путь из переменной окружения.
# Если её нет (локально) — используем папку uploads рядом с app.py.
_vol = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')
if _vol:
    UPLOAD_DIR = os.path.join(_vol, 'uploads')
    DB_PATH = os.path.join(_vol, 'tracks.db')
else:
    UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')
    DB_PATH = os.path.join(BASE_DIR, 'tracks.db')

os.makedirs(UPLOAD_DIR, exist_ok=True)

print("=" * 60)
print("BASE_DIR   :", BASE_DIR)
print("UPLOAD_DIR :", UPLOAD_DIR)
print("DB_PATH    :", DB_PATH)
print("=" * 60)

ALLOWED_EXT = {'.mp3', '.m4a', '.ogg', '.wav', '.flac', '.aac', '.opus'}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024


def db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                size INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()


init_db()


@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')


@app.route('/api/ping')
def ping():
    return jsonify({
        'ok': True,
        'upload_dir': UPLOAD_DIR,
        'upload_exists': os.path.isdir(UPLOAD_DIR),
        'upload_writable': os.access(UPLOAD_DIR, os.W_OK),
    })


@app.route('/<path:filename>')
def static_files(filename):
    full = os.path.join(BASE_DIR, filename)
    if os.path.isfile(full):
        return send_from_directory(BASE_DIR, filename)
    abort(404)


@app.route('/api/tracks', methods=['GET'])
def list_tracks():
    with db() as conn:
        rows = conn.execute(
            'SELECT id, title, filename, size, created_at FROM tracks ORDER BY id DESC'
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'no file'}), 400

    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'empty filename'}), 400

    original_name = f.filename
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify({'error': 'bad format'}), 400

    safe_base = os.path.basename(original_name).replace(' ', '_')
    safe_name = f"{int(datetime.now().timestamp()*1000)}_{safe_base}"
    path = os.path.join(UPLOAD_DIR, safe_name)
    title = os.path.splitext(original_name)[0]

    with db() as conn:
        cur = conn.execute(
            'INSERT INTO tracks (title, filename, size, created_at) VALUES (?, ?, ?, ?)',
            (title, safe_name, 0, datetime.now().isoformat())
        )
        conn.commit()
        track_id = cur.lastrowid

    try:
        f.save(path)
        size = os.path.getsize(path)
    except Exception as e:
        with db() as conn:
            conn.execute('DELETE FROM tracks WHERE id=?', (track_id,))
            conn.commit()
        return jsonify({'error': f'save failed: {e}'}), 500

    with db() as conn:
        conn.execute('UPDATE tracks SET size=? WHERE id=?', (size, track_id))
        conn.commit()

    return jsonify({
        'id': track_id,
        'title': title,
        'filename': safe_name,
        'size': size
    })


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'too large'}), 413


@app.route('/api/tracks/<int:track_id>', methods=['DELETE'])
def delete_track(track_id):
    with db() as conn:
        row = conn.execute('SELECT filename FROM tracks WHERE id=?', (track_id,)).fetchone()
        if not row:
            return jsonify({'error': 'not found'}), 404
        try:
            os.remove(os.path.join(UPLOAD_DIR, row['filename']))
        except FileNotFoundError:
            pass
        conn.execute('DELETE FROM tracks WHERE id=?', (track_id,))
        conn.commit()
    return jsonify({'ok': True})


@app.route('/api/tracks/<int:track_id>', methods=['PUT'])
def rename_track(track_id):
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'empty title'}), 400
    with db() as conn:
        conn.execute('UPDATE tracks SET title=? WHERE id=?', (title, track_id))
        conn.commit()
    return jsonify({'ok': True})


@app.route('/stream/<int:track_id>')
def stream(track_id):
    with db() as conn:
        row = conn.execute('SELECT filename FROM tracks WHERE id=?', (track_id,)).fetchone()
    if not row:
        abort(404)

    path = os.path.join(UPLOAD_DIR, row['filename'])
    if not os.path.isfile(path):
        abort(404)

    mime = mimetypes.guess_type(path)[0] or 'audio/mpeg'
    file_size = os.path.getsize(path)
    range_header = request.headers.get('Range', None)

    if not range_header:
        return send_file(path, mimetype=mime, conditional=True)

    try:
        start_s, end_s = range_header.replace('bytes=', '').split('-')
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else file_size - 1
    except ValueError:
        return send_file(path, mimetype=mime, conditional=True)

    end = min(end, file_size - 1)
    length = end - start + 1

    def generate():
        with open(path, 'rb') as fh:
            fh.seek(start)
            remaining = length
            chunk = 64 * 1024
            while remaining > 0:
                data = fh.read(min(chunk, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    rv = Response(generate(), 206, mimetype=mime, direct_passthrough=True)
    rv.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
    rv.headers.add('Accept-Ranges', 'bytes')
    rv.headers.add('Content-Length', str(length))
    return rv


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)