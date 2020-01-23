const $ = require('jquery');

class FConsole{
    constructor(maxLines = 100){
        this.maxLines = maxLines;
        this.header = $('<div>').addClass('fconsole-header');

        this.title = $('<div>').addClass('fconsole-title');
        this.title.append(`
            <span class="icon icon-terminal"></span>
            <div class="fconsole-pretitle">Output: </div>
            <div class="fconsole-title"></div>`
        );

        let clearButton = $('<div>').addClass('fconsole-clear-button').click(() => this.clear()).text('Clear');
        this.header.append(this.title, clearButton);

        this.output = $('<div>').addClass('fconsole-output fconsole-output-t');
        this.output.append('<div class="fconsole-stdout"></div><div class="fconsole-info"></div>');

        this.element = $('<div>').addClass('fconsole-container').append(this.header, this.output);

        this.panel = atom.workspace.addBottomPanel({
            item: this.element,
            visible: true
        });

        this.command = atom.commands.add('atom-workspace', {
            'fconsole:toggle': (e) => this.toggle()
        });

        this.resizeEvent();
    }

    setTitle(progName){
        this.title.children('.fconsole-title').text(progName)
    }

    clear(){
        this.output.children().empty()
    }

    log(line){
        const stdout = this.output.children('.fconsole-stdout');

        if(stdout.children().length > this.maxLines){
            stdout.children().first().remove();
        }

        stdout.append(`<div class="fconsole-stdout-line">${line}</div>`);
    }

    info(exitInfo, time){
        const { code, signal } = exitInfo;
        const infoElement = this.output.children('.fconsole-info');

        let hex = code ? code.toString(16).toUpperCase() : 0;
        let text = signal || `Process returned ${code} (0x${hex})   execution time: ${time/1000} s`

        infoElement.text(text).css({ color: code !== 0 ? "#ff6347" : "#73c990" })
    }

    size(height){
        const output = this.output;
        let max = output.css('max-height').replace('px', '');

        output.css({height: clamp(height, 0, max)})
    }

    resizeEvent(increment){
        const self = this;
        let pmouseY = 0;
        let prevHeight = 0;

        this.header.mousedown(function(e){
            let pmouseY = e.pageY;
            let prevHeight = self.output.height();
            self.output.toggleClass('fconsole-output-t');

            $('body').mousemove(function(e) {
                let mouseY = e.pageY;
                let delta = pmouseY - mouseY;
                self.size(prevHeight + delta)
            }).mouseup(function(e){
                self.output.toggleClass('fconsole-output-t');
                $(this).off('mousemove mouseup');
            });
        });
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
        this.header.off('mousedown');
    }
}

function clamp(value, min, max){
    return Math.min(max, Math.max(value, min));
}

module.exports = FConsole;
