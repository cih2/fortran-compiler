const $ = require('jquery')

class DialogBox{
    constructor(){
        let content = this.createContent();
        this.panel = atom.workspace.addModalPanel({
            item: content,
            visible: false
        })
    }

    destroy(){
        this.panel.destroy()
    }

    async confirm(icon = '', text = ''){
        const element = $(this.panel.element);
        this.panel.show();

        element.find('.fdialog-text').text(text);
        element.find('.fdialog-text-title').children('#ico').removeClass().addClass(icon)

        const self = this;
        return new Promise((resolve) => {
            element.find('.btn').one('click', function () {
                let id = $(this).attr('id');
                switch (id) {
                    case 'yes':
                        resolve(true);
                        break;
                    case 'no':
                        resolve(false)
                        break;
                }

                self.panel.hide();
            })
        });
    }

    createContent(){
        let container = $('<div>').addClass('fdialog-cont');

        let text = $('<div>').addClass('fdialog-text-cont');
        let buttons = $('<div>').addClass('fdialog-buttons-cont');

        let title = $('<div>').addClass('fdialog-text-title').append('<span id="ico"></span><b>REBUILD PROJECT</b>');
        let dialog = $('<div>').addClass('fdialog-text');

        text.append(title, dialog);

        let yes = $('<button>').addClass('inline-block btn').attr('id','yes').text('YES');
        let no = $('<button>').addClass('inline-block btn').attr('id','no').text('NO');

        buttons.append(yes, no)

        container.append(text, buttons);

        return container;
    }
}

module.exports = DialogBox;
