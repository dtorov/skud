$(document).ready(function() {
    console.log('app started');

    //$('#content').load('management.html','','');
    
     $('#ajax li a').click(function(){
        var toLoad = $(this).attr('href');
        $('#content').load(toLoad,'','');
     return false;    
     });

    }); // $(document).ready(function() {