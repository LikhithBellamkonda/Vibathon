import io

files = ['content.js', 'background.js']
for file in files:
    with io.open(file, 'r', encoding='utf-8') as f:
        data = f.read()

    data = data.replace('\\`', '`')
    data = data.replace('\\$', '$')

    with io.open(file, 'w', encoding='utf-8') as f:
        f.write(data)
print('Fixed files')
