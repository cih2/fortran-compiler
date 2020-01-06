const $ = require('jquery');

class FConsole{
    constructor(maxLines = 100){
        this.maxLines = maxLines;

        this.header = $('<div>').addClass('fconsole-header');
        this.header.append('<span class="icon icon-terminal"></span><div class="fconsole-pretitle">Output: </div>');

        this.output = $('<div>').addClass('fconsole-output fconsole-output-t');
        this.output.append('<div class="fconsole-stdout"></div><div class="fconsole-info"></div>')

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
        this.header.children('.fconsole-title').remove();
        this.header.append(`<div class="fconsole-title">${progName}</div>`)
    }

    clear(){
        this.output.children('.fconsole-stdout').empty()
    }

    log(line){
        const stdout = this.output.children('.fconsole-stdout');

        if(stdout.children().length > this.maxLines){
            stdout.children().first().remove();
        }

        stdout.append(`<div class="fconsole-stdout-line">${line}</div>`);
    }

    info(code, time){
        const infoElement = this.output.children('.fconsole-info');

        let hex = code.toString(16).toUpperCase();
        let text = `Process returned ${code} (0x${hex})   execution time: ${time/1000} s`

        infoElement.text(text).css({ color: code ? "#ff6347" : "#73c990" })
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
