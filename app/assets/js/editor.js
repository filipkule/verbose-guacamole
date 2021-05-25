const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const querystring = require('querystring');
const params = querystring.parse(location.search.slice(1));
let projectPath = params.f;
const git = simpleGit({
  baseDir: (params.new ? projectPath : path.dirname(projectPath))
});
const placeholders = [
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going to Heaven, we were all going direct the other way. (A Tale of Two Cities)',
  'It was a dark and stormy night. (A Wrinkle in Time)',
  'Call me Ishmael. (Moby Dick)',
  'It was a pleasure to burn. (Fahrenheit 451)',
  'It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife. (Pride and Prejudice)',
  'In a hole in the ground there lived a hobbit. (The Hobbit)',
  'Far out in the uncharted backwaters of the unfashionable end of the western spiral arm of the Galaxy lies a small, unregarded yellow sun. (The Hitchhiker\'s Guide to the Galaxy)',
  'It was a bright cold day in April, and the clocks were striking thirteen. (1984)',
  'All children, except one, grow up. (Peter Pan)',
  'There was a boy called Eustace Clarence Scrubb, and he almost deserved it. (Voyage of the Dawn Treader)',
  'The drought had lasted now for ten million years, and the reign of the terrible lizards had long since ended. (2001: A Space Odyssey)',
  'When he was nearly thirteen, my brother Jem got his arm badly broken at the elbow. (To Kill a Mockingbird)',
  'There was no possibility of taking a walk that day. (Jane Eyre)',
  'First the colors. Then the humans. (The Book Thief)',
  '“Where’s Papa going with that ax?” (Charlotte\'s Web)',
  'The thousand injuries of Fortunato I had borne as I best could, but when he ventured upon insult I vowed revenge. (The Cask of Amontillado)'
];
let placeholderN = Math.floor(Math.random() * placeholders.length);
function fileName() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  return (new Array(16)).fill().map(l=>chars[Math.floor(Math.random() * chars.length)]).join('') + '.md';
}
let project = {
  metadata: {
    title: {
      working: 'Untitled Novel',
      final: 'Untitled Novel'
    },
    author: '',
    synopsis: ''
  },
  index: [
    {
      name: 'New File',
      path: './content/' + fileName()
    }
  ]
};
let editor = null;
let currentFile = project.index[0];
let clearing = false;

function resetEditor() {
  clearing = true;
  if (editor) {
    editor.value('');
    editor.toTextArea();
  }
  placeholderN = (placeholderN + Math.floor(Math.random() * (placeholders.length - 1))) % placeholders.length;
  editor = new SimpleMDE({
    element: document.getElementById("editorTextarea"),
    spellChecker: false,
    hideIcons: ['side-by-side', 'fullscreen', 'image'],
    status: false,
    placeholder: placeholders[placeholderN],
  	insertTexts: {
  		image: ["![](https://", ")"],
  	},
    autofocus: true
  });
  editor.codemirror.on("change", function() {
  	if (!clearing) saveFile(currentFile.path);
  });
  clearing = false;
}
function openFile(p, n) {
  resetEditor();
  clearing = true;
  const value = fs.readFileSync(path.resolve(path.dirname(projectPath), p), {
    encoding:'utf8',
    flag:'r'
  });
  editor.value(value);
  currentFile = flatten(project.index).find(i => i.path === p);
  clearing = false;
}
function saveFile(p, v) {
  let value = null;
  if (!v) value = editor.value();
  else value = v;

  fs.writeFileSync(path.resolve(path.dirname(projectPath), p), value);
}
function flatten(arr) {
  let newArr = arr;
  newArr = arr.map(i => {
    if (i.children) return [i, flatten(i.children)];
    else return i;
  }).flat(Infinity);
  return newArr;
}
function idFromPath(p) {
  return p.split('/').slice(-1)[0].split('.')[0];
}

//Git
async function populateGitHistory() {
  await git.log().then((history) => {
    let html = history.all.map(h => `<span id='commit-${h.hash}'>${h.message}</span>`).reverse().join('');
    document.getElementById('git__commits').innerHTML = html;
  });
}
async function commit() {
  const message = document.getElementById('git__commitText').value;
  await git.add('./*');
  await git.commit(message);
  document.getElementById('git__commitText').value = '';
  populateGitHistory();
}

// Filetree items
function populateFiletree() {
  function drawLayer(layer, id) {
    let html = '';

    for (var item of layer) {
      if (typeof item.children !== 'undefined') {
        html += `
        <details
          id=${JSON.stringify(idFromPath(item.path))}
        >
          <summary
            onclick='focusItem(this, event)'
            ondblclick='this.parentNode.toggleAttribute("open")'
            oncontextmenu="document.getElementById('deleteButton').style.display = document.getElementById('renameButton').style.display = 'block';focusItem(this, event);"
          >${item.name}</summary>
        </details>`;
        const itemClone = {...item};
        setTimeout(
          () => {drawLayer(itemClone.children, idFromPath(itemClone.path))},
          0
        );
      } else {
        html += `
        <span
          onclick='focusItem(this, event)'
          ondblclick='openItem(this)'
          oncontextmenu="document.getElementById('deleteButton').style.display = document.getElementById('renameButton').style.display = 'block';focusItem(this, event);"
          id=${JSON.stringify(idFromPath(item.path))}
        >
          ${item.name}
        </span>`;
      }
    }

    document.getElementById(id).innerHTML += html;
  }
  drawLayer(project.index, 'fileTree__list');
}
function focusItem(e, event) {
  event.preventDefault();
  if (e.contentEditable === 'true') return;
  //if (e.classList.contains('active') && event.type !== 'contextmenu') return startRename(e);
  if (document.querySelector('#fileTree .active'))
    document.querySelector('#fileTree .active').classList.toggle('active');
  e.classList.toggle('active');
}
function openItem(e) {
  const file = flatten(project.index).find(i => idFromPath(i.path) === e.id);
  openFile(file.path, file.name);
  return e;
}
function createItem(type) {
  let folder = document.querySelector('#fileTree .active');
  let parent = null;
  if (folder && folder.tagName !== 'DETAILS' && folder.parentNode.tagName === 'DETAILS') {
    folder = folder.parentNode;
  } else if (folder === null || folder.tagName !== 'DETAILS') {
    parent = project.index;
  }

  if (parent === null) {
    var parentFile = flatten(project.index).find(i => idFromPath(i.path) === folder.id);
    parent = parentFile.children;
  }

  const filePath = './content/' + fileName();

  if (type === 'file') {
    fs.writeFileSync(
      path.resolve(path.dirname(projectPath), filePath),
      '',
      {
        encoding: 'utf8',
        flag: 'w'
      }
    );

    parent.push({
      name: 'New File',
      path: filePath
    });
  }
  else if (type === 'folder') parent.push({
    name: 'New Folder',
    path: filePath,
    children: []
  });

  saveFile(projectPath, JSON.stringify(project));

  document.getElementById('fileTree__list').innerHTML = '';
  populateFiletree();

  if (type === 'file') {
    openItem(document.getElementById(idFromPath(filePath))).click();
    startRename(document.getElementById(idFromPath(filePath)));
  } else {
    document.getElementById(idFromPath(filePath)).click();
    document.getElementById(idFromPath(filePath)).open = true;
  }
}
function startRename(e) {
  const isOpen = e.parentNode.open;
  setTimeout(() => {
    if (isOpen !== e.parentNode.open) return;
    e.contentEditable = true;
    e.focus();
    document.execCommand('selectAll', false, null);
    e.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        document.execCommand('insertText', false, ' ');
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        e.blur();
      }
      if (event.key === 'Escape') {
        const file = flatten(project.index).find(i => idFromPath(i.path) === e.id);
        e.innerText = file.name;
        e.blur();
      }
    });
    e.addEventListener('blur', renameItem.bind(this, e));
  }, 300);
}
function renameItem(e) {
  e.removeAttribute('contenteditable');

  const file = flatten(project.index).find(i => idFromPath(i.path) === (e.tagName === 'SUMMARY' ? e.parentNode.id : e.id));

  if (e.innerText.length <= 0 || e.innerText === file.name) {
    e.innerText = file.name;
    return;
  }

  file.name = e.innerText;

  saveFile(projectPath, JSON.stringify(project));
}
function deleteItem() {
  let item = document.querySelector('#fileTree .active');
  if (!confirm(`Do you really want to delete this ${item.tagName === 'SPAN' ? 'file' : 'folder and everything in it'}? There is no undo.`)) return;

  let file = flatten(project.index).find(i => idFromPath(i.path) === (item.tagName === 'SPAN' ? item.id : item.parentNode.id));

  function deleteInFolder(folder) {
    for (f of folder) {
      if (f.children) {
        deleteInFolder(f.children);
      } else {
        fs.unlinkSync(path.resolve(path.dirname(projectPath), f.path));
      }
    }
  }

  if (item.tagName === 'SPAN') {
    fs.unlinkSync(path.resolve(path.dirname(projectPath), file.path));
  } else if (item.tagName === 'SUMMARY') {
    deleteInFolder(file.children);
  }

  file.delete = true;

  project.index = project.index.filter(i => !i.delete);
  saveFile(projectPath, JSON.stringify(project));

  (item.tagName === 'SPAN' ? item : item.parentNode).remove();
}
function showContextMenu(event) {
  contextMenu.style.top = event.clientY + 'px';
  contextMenu.style.left = event.clientX + 'px';

  if (!contextMenu.classList.contains('visible')) contextMenu.classList.toggle('visible');
}

(async () => {
  if (params.new) {
    console.info('New project alert! Let me get that set up for you...');
    console.info('Initializing git repository...');
    await git.init();
    console.info('Creating project file...');
    projectPath = path.resolve(projectPath, 'project.vgp');
    await fs.writeFile(
      projectPath,
      JSON.stringify(project),
      {
        encoding: 'utf8',
        flag: 'w'
      },
      (err) => {
        if (err) throw new Error(err);
        else {
          console.info('File written successfully!');
        }
      }
    );
    console.info('Creating initial file...');
    try {
      fs.mkdirSync(path.resolve(path.dirname(projectPath), './content'));
    } catch(err) {
      console.warn(err);
    }
    await fs.writeFile(
      path.resolve(path.dirname(projectPath), project.index[0].path),
      '',
      {
        encoding: 'utf8',
        flag: 'w'
      },
      (err) => {
        if (err) throw new Error(err);
        else {
          console.info('File written successfully!');
        }
      }
    );
    console.info('Creating initial commit...');
    git.add('./*').commit('Created project.');
    console.info('Done! Changing URL to avoid refresh-slipups.');
    history.replaceState(null, null, './editor.html?f=' + projectPath);
  } else {
    project = JSON.parse(fs.readFileSync(projectPath, {
      encoding:'utf8',
      flag:'r'
    }));
    currentFile = flatten(project.index)[0];
  }
})().finally(() => {
  openFile(currentFile.path, currentFile.name);
  populateFiletree();
  populateGitHistory();
});

window.addEventListener("click", e => {
  if (contextMenu.classList.contains('visible')) {
    contextMenu.classList.toggle('visible');
    document.getElementById('deleteButton').style.display = document.getElementById('renameButton').style.display = 'none';
  };
});
