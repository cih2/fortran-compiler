const $ = require('jquery');

const delay = 1;

class FConsole{
    constructor(maxLines = 100){
        this.maxChunks = maxLines;
        this.element = this.createElement();
        this.events = [];
        this.queue = [];

        this.createEvents();

        this.stdinEditor = null;

        this.command = atom.commands.add('atom-workspace', {
            'fconsole:toggle': (e) => this.toggle()
        });

        this.panel = atom.workspace.addBottomPanel({
            item: this.element,
            visible: true
        });
    }

    createElement(){
        let resize = $('<div>').addClass('fconsole-resize atom-dock-resize-handle bottom atom-dock-resize-handle-resizable');
        let overlay = $('<div>').addClass('fconsole-resize-overlay atom-dock-cursor-overlay bottom');
        let header = this.createHeader();
        let output = this.createBody();
        let elmnt = $('<div>').addClass('fconsole-container')

        elmnt.append(resize, overlay, header, output);

        return elmnt;
    }

    createHeader(){
        let header = $('<div>').addClass('fconsole-header');
        let title = $('<div>').addClass('fconsole-title');

        title.append(`
            <div class="fmark fstatus-stopped"></div>
            <div class="fconsole-title-name"> --- </div>
            <span class='loading loading-spinner-tiny inline-block'></span>`
        );

        header.append(title);
        header.append('<div class="fconsole-toolbar"></div>')

        let tabsCont = $('<div>').addClass('fconsole-header-elmnts');

        let tabIn = $('<div>').addClass('fconsole-tab ftab-input').append(`
            <div class="icon icon-pencil"></div>
            <div class="fconsole-tab-name">input</div>`)

        let tabOut = $('<div>').addClass('fconsole-tab ftab-output').append(`
            <div class="icon icon-terminal"></div>
            <div class="fconsole-tab-name">output</div>`);

        let tabLog = $('<div>').addClass('fconsole-tab ftab-log').append(`
            <div class="icon icon-file-text"></div>
            <div class="fconsole-tab-name">log</div>`)

        tabsCont.append(tabIn, tabOut, tabLog);
        header.append(tabsCont);

        let buttonsCont = $('<div>').addClass('fconsole-buttons');

        let pageButtonsCont = $('<div>').addClass('fconsole-page-buttons')
        let up = $('<div>').addClass('f-page-button fup-pag icon-chevron-up fdeactivated').attr('title', 'page up');
        let down = $('<div>').addClass('f-page-button fdown-pag icon-chevron-down fdeactivated').attr('title', 'page down');

        pageButtonsCont.append(up, down);

        let clearButton = $('<div>').addClass('fconsole-button fclear icon-x').attr('title', 'clear');
        let closeButton = $('<div>').addClass('fconsole-button fclose icon-dash').attr('title', 'close');
        let minButton = $('<div>').addClass('fconsole-button fmin icon-triangle-down fconsole-collapsed').attr('title', 'minimize/maximaze');

        buttonsCont.append(pageButtonsCont, clearButton, minButton, closeButton);
        tabsCont.append(buttonsCont);

        return header;
    }

    createBody(){
        let output = $('<div>').addClass('fconsole-output fconsole-output-t');

        this.editor = atom.workspace.buildTextEditor()
        this.editor.setPlaceholderText("Program Input")

        let editorView = $(atom.views.getView(this.editor)).addClass('fconsole-body fconsole-stdin');
        output.append(editorView);

        output.append(`
            <div class="fconsole-body fconsole-stdout fconsole-prog" cursor="0"></div>
            <div class="fconsole-body fconsole-stdout fconsole-compiler" cursor="0"></div>
            <div class="fconsole-info"></div>`
        );

        return output;
    }

    createEvents(){
        const self = this;
        $(function () {
            let output = $('.fconsole-output');

            let resize = $('.fconsole-resize').mousedown(function(e){
                let initMouseY = e.pageY;
                let initHeight = output.height();

                let prevHeight = initHeight;
                let deltaHeight = 0;

                output.toggleClass('fconsole-output-t');
                $('.fconsole-resize-overlay').toggleClass('atom-dock-cursor-overlay-visible');

                $('body').mousemove(function(e) {
                    let mouseY = e.pageY;
                    let delta = initMouseY - mouseY;
                    let size = initHeight + delta;

                    deltaHeight = size - prevHeight;
                    prevHeight = size;

                    if(!(deltaHeight < 0 && output.height() < 20)) {
                        self.size(size)
                    }else{
                        resize.trigger('mouseup');
                        self.size(0);
                    }
                }).mouseup(function(e){
                    $('.fconsole-resize-overlay').toggleClass('atom-dock-cursor-overlay-visible');
                    output.toggleClass('fconsole-output-t');
                    $(this).off('mousemove mouseup');
                });
            });

            $('.fconsole-tab').click(function () {
                $('.ftab-selected').removeClass('ftab-selected');
                $(this).addClass('ftab-selected');

                $('.fconsole-body').addClass('fhidden')
            });

            let tabIn = $('.ftab-input').click(function(e) {
                let elmnt = $('.fconsole-stdin').removeClass('fhidden')
                self.updateUI()
            });

            let tabOut = $('.ftab-output').click(function(e){
                let stdout = $('.fconsole-prog').removeClass('fhidden')
                self.updateUI()
            }).trigger('click');

            let tabLog = $('.ftab-log').click(function(e){
                let stdout = $('.fconsole-compiler').removeClass('fhidden')
                self.updateUI()
            });

            let clear = $('.fconsole-button.fclear').click(() => self.clear());
            let close = $('.fconsole-button.fclose').click(() => self.toggle());
            let min = $('.fconsole-button.fmin').click(function(e){
                let saved = output.attr('saved-height') || 0;
                if(output.height()){
                    output.attr('saved-height', output.height())
                    self.size(0)
                }else{
                    output.removeAttr('saved-height')
                    self.size(Number.parseInt(saved) || 100)
                }
            });

            let pageButtons = $('.f-page-button').click(function(e){
                let view = $('.fconsole-stdout:visible');
                let cursor = Number.parseInt(view.attr('cursor') || 0);
                let n = view.children('.fchunks-cont').length;

                if(n === 0) return

                let i = $(this).hasClass('fup-pag') ? -1 : ($(this).hasClass('fdown-pag') ? 1 : 0);
                let newCursor = cursor + i;

                self.viewPage(view, newCursor);
                self.updateUI();
            });

            self.events.push(output, resize, tabIn, tabOut, tabLog, clear, close, min, pageButtons);
        })
    }

    setTitle(progName){
        $('.fconsole-title-name').text(progName)
    }

    reset(){
        this.clearQueue();
        let stdout = $('.fconsole-stdout').empty()
        this.viewPage(stdout, 0);
        stdout = $('.fconsole-info').empty()
        this.viewPage(stdout, 0);
        this.updateUI()
    }

    clear(){
        let stdout = $('.fconsole-stdout:visible').empty()
        this.viewPage(stdout, 0)
        this.updateUI()
    }

    getInput(){
        return this.editor.getText() + '\n';
    }

    clearQueue(){
        while (this.queue.length) {
            clearTimeout(this.queue.pop())
        }
    }

    log(line){
        const stdout = $('.fconsole-prog');
        this.genLine(stdout, line, false);
    }

    message(line){
        const stdout = $('.fconsole-compiler');
        // let newLine = $(`<div>`).addClass(`fconsole-stdout-chunk ${type}`).text(line);
        this.genLine(stdout, line, true);
    }

    info(exitInfo, time){
        const { code, signal } = exitInfo;
        const infoElement = $('.fconsole-info').empty();

        let hex = code ? code.toString(16).toUpperCase() : 0;
        let text = `${signal || `Process returned ${code} (0x${hex})`}   execution time: ${time/1000} s`

        infoElement.text(text).css({ color: code !== 0 ? "#ff6347" : "#73c990" })
    }

    size(height){
        let output = $('.fconsole-output');
        let max = output.css('max-height').replace('px', '');
        let nHeight = clamp(height, 0, max);

        if(nHeight === 0){
            $('.fconsole-button.fmin')
            .addClass('fconsole-collapsed');
        }else {
            $('.fconsole-button.fmin')
            .removeClass('fconsole-collapsed');
        }

        output.css({height: nHeight})
    }

    viewPage(view, page){
        let childs = view.children('.fchunks-cont');
        let index = clamp(page, 0, (childs.length > 0 ? childs.length - 1 : 0))

        childs.removeClass('visible-cont');
        $(childs[index]).addClass('visible-cont');

        view.attr('cursor', index);
    }

    updateUI(){
        let view = $('.fconsole-body:not(.fhidden)');
        let childs = view.children('.fchunks-cont');
        let last = childs.length > 0 ? childs.length - 1 : 0;
        let cursor = clamp(Number.parseInt(view.attr('cursor') || 0), 0, last);

        let up = $('.f-page-button.fup-pag');
        let down = $('.f-page-button.fdown-pag');

        if(cursor <= 0) up.addClass('fdeactivated');
        else up.removeClass('fdeactivated');

        if(cursor >= last) down.addClass('fdeactivated');
        else down.removeClass('fdeactivated');
    }

    addLine(view, text, log){
        let conts = view.children('.fchunks-cont');
        let last = conts.last();
        let updateUI = this.updateUI;
        let updateView = this.viewPage;

        if(conts.length === 0){
            last = addContainer();
        }

        let aLines = text.split('\n').filter(e => e.length > 0);

        while (aLines.length > 0) {
            let nl = numLines(last);

            if(nl >= this.maxChunks){
                last = addContainer()
                nl = 0
            }

            let nsl = this.maxChunks - nl; // aLines.length >= this.maxChunk ? this.maxChunks - nl : aLines.length;
            let nt = aLines.splice(0, nsl);

            if(log){
                nt = nt.map(e => {
                    let type = getMessageType(e);
                    if(type){
                        return `<div class="${type}">${e}</div>`;
                    }else {
                        return e;
                    }
                })
            }

            appendLines(last, nt.join('\n'), nl + nt.length);
            scroll(last);
        }

        function addContainer() {
            let newCont = $('<div>').addClass('fchunks-cont');
            view.append(newCont);

            updateView(view, view.children('.fchunks-cont').length - 1);
            updateUI();

            return newCont;
        }

        function appendLines(node, text, nl){
            let elmnt = $('<div>').addClass(`fconsole-stdout-chunk`).append(text);
            node.append(elmnt);
            node.attr('n-lines', nl);
        }

        function numLines(node) {
            return Number.parseInt(node.attr('n-lines')) || 0;
        }

        function scroll(cont){
            cont.scrollTop(cont.prop('scrollHeight'))
        }

        function getMessageType(mssg){
            if(mssg.match(/^Warning/m)) return 'text-warning';
            else if(mssg.match(/^Error/m)) return 'text-error';
            else return false
        }
    }

    genLine(stdout, line, log){
        let id = setTimeout(() => {
            this.addLine(stdout, line, log);
        }, delay)

        this.queue.push(id);
    }

    showLoading(){
        $('.fconsole-title').children('.loading').css({
            display: 'block'
        }).animate({
            opacity: 1
        }, 150);
    }

    hideLoading(){
        $('.fconsole-title').children('.loading').animate({
            opacity: 0
        }, 150, function(){
            $(this).css({
                display: 'none'
            })
        });
    }

    addButton(props){
        if(!props) return

        if(typeof props !== 'object')
            throw new TypeError(`TypeError [ERR_INVALID_ARG_TYPE]: The "props" argument must be of type object. Received type ${typeof props}`);

        let newButton = $('<div>').addClass(`ftool-btn ${props.icon != null ? `icon-${props.icon}` : ''}`);

        if(props.title) newButton.attr('title', props.title);
        if(props.callback){
            newButton.click(props.callback)
        }

        $('.fconsole-toolbar').append(newButton)
    }

    toggleMarkerStatus(){
        $('.fmark').toggleClass('fstatus-stopped')
        $('.fmark').toggleClass('fstatus-running')
    }

    toggle(){
        this.panel.isVisible() ? this.panel.hide() : this.panel.show();
    }

    show(){
        this.panel.show();
    }

    hide(){
        this.panel.hide();
    }

    destroy(){
        this.panel.destroy();
        this.command.dispose();
        $(this.events).off('click');
    }
}

function clamp(value, min, max){
    return Math.min(max, Math.max(value, min));
}

function hide(e){
    e.addClass('fhidden')
}

function hide(e){
    e.removeClass('fhidden')
}

module.exports = FConsole;
