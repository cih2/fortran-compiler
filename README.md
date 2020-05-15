# fortran-compiler

This Atom package allows you to compile and run Fortran within the editor.

To compile press <kbd>ctrl</kbd> + <kbd>F5</kbd> or use the buttons in the console.

## Recommended Packages 

* [ide-fortran](https://atom.io/packages/ide-fortran)
* [language-fortran](https://atom.io/packages/language-fortran)

    ###### Note: some of these packages may need dependencies

## Dependencies

This package relies on a Fortran compiler (gfortran).

### Linux

The GNU Compiler Collection may come with your distribution. Run `which gfortran` to find out.

If that command does not output

```
/usr/bin/gcc
/usr/bin/g++
```
you will need to install it.

### Windows

You'll need to install [MinGW](http://www.mingw.org/) and [add it to your PATH](http://www.howtogeek.com/118594/how-to-edit-your-system-path-for-easy-command-line-access/).

### Mac

You'll need to install [XCode](https://developer.apple.com/xcode/).