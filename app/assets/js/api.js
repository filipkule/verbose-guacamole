let api = {};

(() => {
  // Include packages
  const fs = require('fs');
  const path = require('path');
  const simpleGit = require('simple-git');
  const querystring = require('querystring');
  const marked = require('marked');
  const SimpleMDE = require('simplemde');

  // Initialize variables
  let git = null;
  let placeholders = [
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
  let editor = null;
  let currentFile = null;
  let clearing = false;
  let currentlyDragging = null;
  let hoveringOver = null;


  api = {
    commit: async () => {
      const message = document.getElementById('git__commitText').value;
      document.getElementById('git__commitButton').innerText = 'Working...';
      console.info('Committing: ' + message);

      try {
        await git.add('./*').commit(message)._chain;
        console.info('Committed.');
        document.getElementById('git__commitButton').innerText = 'Commit';
        document.getElementById('git__commitText').value = '';
      } catch (err) {
        window.alert(err);
      }

      setTimeout(populateGitHistory, 250);
    },
    createItem: (type) => {
      let folder = document.querySelector('#fileTree .active');
      let parent = null;
      if (folder && folder.tagName !== 'DETAILS' && folder.parentNode.tagName === 'DETAILS') {
        folder = folder.parentNode;
      } else if (folder === null || folder.tagName !== 'DETAILS') {
        parent = project.index;
      }

      if (parent === null) {
        var parentFile = api.flatten(project.index).find(i => api.idFromPath(i.path) === folder.id);
        parent = parentFile.children;
      }

      const filePath = './content/' + api.fileName();

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

      api.saveProject();

      api.populateFiletree();
      setTimeout(() => {
        if (type === 'file') {
          api.openItem(api.idFromPath(filePath)).click();
          api.startRename(document.getElementById(api.idFromPath(filePath)));
        } else {
          document.getElementById(api.idFromPath(filePath)).click();
          document.getElementById(api.idFromPath(filePath)).open = true;
        }
      }, 0);
    },
    deleteItem: () => {
      let item = document.querySelector('#fileTree .active');
      if (!confirm(`Do you really want to delete this ${item.tagName === 'SPAN' ? 'file' : 'folder and everything in it'}? There is no undo.`)) return;

      let file = api.flatten(project.index).find(i => api.idFromPath(i.path) === (item.tagName === 'SPAN' ? item.id : item.parentNode.id));

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

      (item.tagName === 'SPAN' ? item : item.parentNode).remove();
      setTimeout(() => {
        console.log(project);
        api.saveProject();
      }, 0);
    },
    fileName: () => {
      const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
      return (new Array(16)).fill().map(l=>chars[Math.floor(Math.random() * chars.length)]).join('') + '.md';
    },
    flatten: (arr) => {
      let newArr = arr;
      newArr = arr.map(i => {
        // If there are children, add them to the top-level list
        if (i.children) return [i, api.flatten(i.children)];
        else return i;
      }).flat(Infinity);
      return newArr;
    },
    focusItem: (id) => {
      const element = document.getElementById(id).tagName === 'SPAN' ?
        document.getElementById(id) :
        document.getElementById(id).querySelector('summary');
      if (element.contentEditable === 'true') return;
      if (element.classList.contains('active') && event.type !== 'contextmenu') return api.startRename(element);
      if (document.querySelector('#fileTree .active'))
        document.querySelector('#fileTree .active').classList.toggle('active');
      element.classList.toggle('active');
    },
    idFromPath: (p) => {
      return p.split('/').slice(-1)[0].split('.')[0];
    },
    init: async () => {
      this.params = querystring.parse(params);
      this.projectPath = this.params.f;

      // Initialize git in project directory
      git = simpleGit({
        baseDir: (params.new ? projectPath : path.dirname(projectPath))
      });

      if (this.params.new) {
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
        currentFile = api.flatten(project.index).filter(i => typeof i.children === 'undefined')[0];
        console.info('Creating initial commit...');
        await git.add('./*');
        await git.commit('Create project')
        await api.populateGitHistory()
        .then(() => {
          console.info('Done! Changing URL to avoid refresh-slipups.');
          history.replaceState(null, null, './editor.html?f=' + projectPath);
        });
      } else {
        api.populateGitHistory();
        project = JSON.parse(fs.readFileSync(projectPath, {
          encoding:'utf8',
          flag:'r'
        }));
        currentFile = api.flatten(project.index).filter(i => typeof i.children === 'undefined')[0];

        // For compatibility with v0.1.0
        if (typeof project.openFolders === 'undefined') project.openFolders = [];

        // For compatibility with <v0.1.2
        if (typeof project.openFile === 'undefined') project.openFile = api.idFromPath(currentFile.path);
        else currentFile = api.flatten(project.index).find(f => api.idFromPath(f.path) === project.openFile);
      }

      api.openFile(currentFile.path, currentFile.name, true);
      api.populateFiletree();
      api.updateStats();

      setTimeout(() => {
        document.getElementById(api.idFromPath(currentFile.path)).click();
      }, 3000);
    },
    moveItem: (event, index, main = false) => {
      event.stopPropagation();
      const target = (
        event.path.find(e => e.tagName === 'DETAILS') ?
        api.flatten(project.index).find(f => api.idFromPath(f.path) === event.path.find(e => e.tagName === 'DETAILS').id) :
        {children: project.index}
      );
      let order = false;
      if (event.toElement.tagName === 'SPAN' || event.toElement.id === 'fileTree__actions') order = true;

      // Check if moving folder into itself
      if (typeof currentlyDragging.children !== 'undefined') {
        if (event.path.find(e => e.id === api.idFromPath(currentlyDragging.path))) return;
      }

      // Get current parent
      let parent = api.flatten(project.index).find(f => {
        if (typeof f.children === 'undefined') return false;
        return f.children.indexOf(currentlyDragging) !== -1;
      });
      if (typeof parent === 'undefined') parent = {children: project.index};

      // Remove from parent
      parent.children.splice(parent.children.indexOf(currentlyDragging), 1);

      // Add to target
      if (order) {
        target.children.splice(index, 0, JSON.stringify(currentlyDragging));
      } else {
        target.children.push(currentlyDragging);
      }

      target.children = target.children.map(c => {
        if (typeof c === 'string') return JSON.parse(c);
        else return c;
      });

      project.index = project.index.map(c => {
        if (typeof c === 'string') return JSON.parse(c);
        else return c;
      });

      api.populateFiletree();

      // Save
      api.saveProject();
    },
    openFile: (p, n, first = false) => {
      if (currentFile === api.flatten(project.index).find(i => i.path === p) && !first) return;
      api.resetEditor();
      clearing = true;
      const value = fs.readFileSync(path.resolve(path.dirname(projectPath), p), {
        encoding:'utf8',
        flag:'r'
      });
      editor.value(value);
      currentFile = api.flatten(project.index).find(i => i.path === p);
      clearing = false;
    },
    openItem: (id) => {
      const file = api.flatten(project.index).find(i => api.idFromPath(i.path) === id);
      api.openFile(file.path, file.name);
      project.openFile = id;
      api.saveProject();
      return document.getElementById(id);
    },
    placeholders,
    populateFiletree: () => {
      document.getElementById('fileTree__list').innerHTML = '';

      function drawLayer(layer, id) {
        let html = '';

        for (var item of layer) {
          if (typeof item.children !== 'undefined') {
            html += `
            <details
              id=${JSON.stringify(api.idFromPath(item.path))}
              ondragover='event.preventDefault()'
              ondrop='api.moveItem(event, getDraggingIndex())'
            >
              <summary
                draggable="true"
                ondragstart="api.startMoveItem(event)"
                ondragend="api.stopMoveItem(event)"
                onclick='event.preventDefault();api.focusItem(this.parentNode.id);'
                ondblclick='this.parentNode.toggleAttribute("open");api.setOpenFolders();'
                oncontextmenu="document.getElementById('deleteButton').style.display = document.getElementById('renameButton').style.display = 'block';event.preventDefault();api.focusItem(this.id);"
              >${item.name}</summary>
            </details>`;
            const itemClone = {...item};
            setTimeout(
              () => {drawLayer(itemClone.children, api.idFromPath(itemClone.path))},
              0
            );
          } else {
            html += `
            <span
              onclick='event.preventDefault();api.focusItem(this.id)'
              ondblclick='api.openItem(this.id)'
              oncontextmenu="document.getElementById('deleteButton').style.display = document.getElementById('renameButton').style.display = 'block';event.preventDefault();api.focusItem(this.id);"
              draggable="true"
              ondragstart="api.startMoveItem(event)"
              ondragend="api.stopMoveItem(event)"
              ondragover="setHovering(this)"
              ondrag="updatePageXY(event)"
              id=${JSON.stringify(api.idFromPath(item.path))}
            >
              ${item.name}
            </span>`;
          }
        }

        document.getElementById(id).innerHTML += html;
      }
      drawLayer(project.index, 'fileTree__list');

      api.restoreOpenFolders();
    },
    populateGitHistory: async () => {
      try {
        let html = (await git.log()).all.map(h => `<span id='commit-${h.hash}'>${h.message}</span>`).reverse().join('');
        document.getElementById('git__commits').innerHTML = html;
      } catch (err) {
        console.error(err);
      }
    },
    resetEditor: () => {
      clearing = true;

      // If the editor already exists, clear it
      if (editor) {
        editor.value('');
        editor.toTextArea();
      }
      placeholderN = Date.now() % (api.placeholders.length - 1);
      editor = new SimpleMDE({
        element: document.getElementById("editorTextarea"),
        spellChecker: false,
        hideIcons: ['side-by-side', 'image'],
        status: false,
        placeholder: api.placeholders[placeholderN],
      	insertTexts: {
      		image: ["![](https://", ")"],
      	},
        autofocus: true
      });
      editor.toolbarElements.fullscreen.addEventListener('click', () => {
        document.exitFullscreen();
        document.documentElement.requestFullscreen();
      });
      editor.codemirror.on("change", function() {
      	if (!clearing) api.saveFile();
        api.updateStats();
      });
      clearing = false;
    },
    saveFile: (v) => {
      let p = currentFile.path;
      let value = null;
      if (!v) value = editor.value();
      else value = v;

      fs.writeFileSync(path.resolve(path.dirname(projectPath), p), value);
    },
    saveProject: () => {
      fs.writeFileSync(path.resolve(projectPath), JSON.stringify(project));
    },
    setOpenFolders: () => {
      let folders = [...document.querySelectorAll('#fileTree__list details')];

      folders = folders.map(folder => {
        return {
          id: folder.id,
          open: folder.open
        };
      });

      project.openFolders = [...folders];

      api.saveProject();
    },
    renameItem: (e) => {
      e.removeAttribute('contenteditable');

      const file = api.flatten(project.index).find(i => api.idFromPath(i.path) === (e.tagName === 'SUMMARY' ? e.parentNode.id : e.id));

      if (e.innerText.length <= 0 || e.innerText === file.name) {
        e.innerText = file.name;
        return;
      }

      file.name = e.innerText;

      api.saveProject();
    },
    startMoveItem: (event) => {
      event.currentTarget.style.backgroundColor = '#fff';
      event.currentTarget.style.color = '#000';
      const idToMove = (event.currentTarget.tagName === 'SUMMARY' ? event.currentTarget.parentNode.id : event.currentTarget.id);
      currentlyDragging = api.flatten(project.index).find(i => api.idFromPath(i.path) === idToMove);
    },
    startRename: (e) => {
      const isOpen = (e.tagName === 'SUMMARY' ? e.parentNode.open : currentFile);
      setTimeout(() => {
        if (isOpen !== (e.tagName === 'SUMMARY' ? e.parentNode.open : currentFile)) return;
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
            const file = api.flatten(project.index).find(i => api.idFromPath(i.path) === e.id);
            e.innerText = file.name;
            e.blur();
          }
        });
        e.addEventListener('blur', api.renameItem.bind(this, e));
      }, 300);
    },
    stopMoveItem: (event) => {
      event.currentTarget.style.backgroundColor = '';
      event.currentTarget.style.color = '';
    },
    restoreOpenFolders: () => {
      const toOpen = project.openFolders;
      for (const folder of toOpen) {
        try {
          document.getElementById(folder.id).open = folder.open;
        } catch (err) {
          setTimeout(restoreOpenFolders, 0);
        }
      }
    },
    updateStats: () => {
      let content = marked(editor.value());
      var div = document.createElement("div");
      div.innerHTML = content;
      content = div.innerText;
      let stats = {};

      stats.words = content
        .split(/ |\n/)
        .filter(w => w.length);

      stats.words = stats.words.length + ' words'

      stats.lines = content.split('\n').filter(l => l.length).length + ' lines';

      //Update stats element
      document.getElementById('editor__stats').innerText = Object.values(stats).join(', ') + '.';
    },
  };

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
        path: './content/' + api.fileName()
      }
    ],
    openFolders: []
  };

  let placeholderN = Date.now() % api.placeholders.length;
})()