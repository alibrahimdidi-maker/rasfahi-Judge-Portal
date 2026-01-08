import os
import random
import pandas as pd
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'rasfahi_secret_2024'
socketio = SocketIO(app, cors_allowed_origins="*")

# --- ޑޭޓާ (މިސާލަކަށް މެމޮރީގައި) ---
# ޙަޤީޤީ ސޮފްޓްވެއަރ އެއްނަމަ މިއަށް ޑޭޓާބޭސް ބޭނުންކުރާނެ
current_state = {
    "active_student": None,  # ސްޓޭޖްގައި ހުރި ކުއްޖާ
    "theme": "theme-gold-green", # ޑީފޯލްޓް ތީމް
    "language": "dv",        # ޑީފޯލްޓް ބަސް
    "used_questions": []     # މި ސެޝަންގައި ބޭނުންކުރި ސުވާލު
}

# ޑަމީ ދަރިވަރުންގެ ލިސްޓު (CSV އިން ނަގާގޮތަށް ބަދަލުކުރެވޭނެ)
students_db = [
    {"id": "001", "name": "Ahmed Ali", "age": 10, "gender": "M", "cat": "Hifz 15", "photo": "boy.png"},
    {"id": "002", "name": "Fathimath Zeena", "age": 12, "gender": "F", "cat": "Thilavath", "photo": "girl.png"},
    {"id": "003", "name": "Hassan Zaid", "age": 15, "gender": "M", "cat": "Hifz 30", "photo": "boy.png"},
]

# ސުވާލު ފައިލް އުފެއްދުން (ނެތް ނަމަ)
if not os.path.exists('questions.csv'):
    df = pd.DataFrame({
        'id': range(1, 101),
        'text': [f'ސުވާލު ނަންބަރު {i} - ޤުރުއާނުގެ މިވެނި ސޫރަތެއް ކިޔަވާ...' for i in range(1, 101)]
    })
    df.to_csv('questions.csv', index=False)

def get_questions():
    df = pd.read_csv('questions.csv')
    return df.to_dict('records')

# --- Routes (ޕޭޖުތަކަށް ދާ މަގުތައް) ---

@app.route('/')
def index():
    return "<h1>Rasfahi Portal Running... Go to /staff, /judge, /student, or /admin</h1>"

@app.route('/staff')
def staff_panel():
    return render_template('staff.html', students=students_db)

@app.route('/judge')
def judge_panel():
    return render_template('judge.html')

@app.route('/student')
def student_screen():
    return render_template('student.html')

@app.route('/admin')
def admin_panel():
    return render_template('admin.html')

# --- SocketIO Events (ރިއަލް ޓައިމް މަސައްކަތް) ---

@socketio.on('connect')
def handle_connect():
    # މީހަކު ވަނުމުން މިހާރު ހުރި ސްޓޭޓް ފޮނުވުން
    emit('update_state', current_state)

# 1. ސްޓާފް: ދަރިވަރު ސްޓޭޖަށް ފޮނުވުން
@socketio.on('staff_send_student')
def handle_send_student(data):
    student_id = data['id']
    student = next((s for s in students_db if s['id'] == student_id), None)
    if student:
        current_state['active_student'] = student
        current_state['used_questions'] = [] # އާ ކުއްޖެއްވީމަ ސުވާލު ލިސްޓު ރީސެޓް (ނުވަތަ ބޭނުންނަމަ ބެހެއްޓިދާނެ)
        
        # ހުރިހާ ސްކްރީނަކަށް އެންގުން
        emit('update_student', student, broadcast=True)

# 2. ދަރިވަރު: ސުވާލު ނަންބަރެއް ނެގުން
@socketio.on('student_pick_question')
def handle_pick_question(data):
    # ހުރިހާ ސުވާލެއް ނެގުން
    all_questions = get_questions()
    # ބާކީ ހުރި ސުވާލުތައް ހޯދުން
    available = [q for q in all_questions if q['id'] not in current_state['used_questions']]
    
    if available:
        # ރެންޑަމްކޮށް ސުވާލެއް ނެގުން
        selected = random.choice(available)
        current_state['used_questions'].append(selected['id'])
        
        # ޖަޖުންނަށް ސުވާލު ދެއްކުން (ދަރިވަރަށް ނުފެންނާނެ)
        socketio.emit('show_question_judge', selected, broadcast=True)
        # ދަރިވަރަށް ހަމައެކަނި ނަންބަރު ދެއްކުން
        socketio.emit('show_question_student', {'id': selected['id']}, broadcast=True)

# 3. އެޑްމިން: ތީމް ބަދަލުކުރުން
@socketio.on('change_theme')
def handle_theme(theme_name):
    current_state['theme'] = theme_name
    emit('apply_theme', theme_name, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0')
